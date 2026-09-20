//! WASAPI objects stay on their owning MTA. No audio is rendered or persisted here.
use super::*;
use ::windows::{
    core::{implement, Interface, Ref, HRESULT, PCWSTR, PWSTR},
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Foundation::{CloseHandle, FILETIME, HANDLE, WAIT_OBJECT_0},
        Media::Audio::*,
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                StructuredStorage::{
                    PropVariantClear, PropVariantToStringAlloc, PROPVARIANT, PROPVARIANT_0,
                    PROPVARIANT_0_0, PROPVARIANT_0_0_0,
                },
                BLOB, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
            },
            Threading::{
                CreateEventW, GetProcessTimes, OpenProcess, QueryFullProcessImageNameW,
                WaitForSingleObject, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
                PROCESS_SYNCHRONIZE,
            },
            Variant::VT_BLOB,
        },
    },
};
use std::{
    mem::{size_of, ManuallyDrop},
    sync::mpsc,
};

struct Apartment;
impl Apartment {
    fn new() -> Result<Self, String> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(message)?;
        }
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
struct OwnedHandle(HANDLE);
impl Drop for OwnedHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}
fn message(error: ::windows::core::Error) -> String {
    format!("Windows audio: {error}")
}

unsafe fn take_string(value: PWSTR) -> String {
    let text = value.to_string().unwrap_or_default();
    CoTaskMemFree(Some(value.0.cast()));
    text
}
fn enumerator() -> Result<IMMDeviceEnumerator, String> {
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(message) }
}
fn process(pid: u32) -> Result<(OwnedHandle, u64, String), String> {
    unsafe {
        let handle = OwnedHandle(
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                false,
                pid,
            )
            .map_err(message)?,
        );
        let (mut created, mut exit, mut kernel, mut user) = (
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
        );
        GetProcessTimes(handle.0, &mut created, &mut exit, &mut kernel, &mut user)
            .map_err(message)?;
        let created = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
        let mut name = vec![0u16; 32768];
        let mut length = name.len() as u32;
        QueryFullProcessImageNameW(
            handle.0,
            PROCESS_NAME_WIN32,
            PWSTR(name.as_mut_ptr()),
            &mut length,
        )
        .map_err(message)?;
        let full = String::from_utf16_lossy(&name[..length as usize]);
        let name = full.rsplit(['\\', '/']).next().unwrap_or(&full).to_owned();
        Ok((handle, created, name))
    }
}
unsafe fn endpoint_name(device: &IMMDevice) -> String {
    let Ok(store) = device.OpenPropertyStore(STGM_READ) else {
        return "Audio output".into();
    };
    let Ok(mut value) = store.GetValue(&PKEY_Device_FriendlyName) else {
        return "Audio output".into();
    };
    let result = PropVariantToStringAlloc(&value)
        .map(|s| take_string(s))
        .unwrap_or_else(|_| "Audio output".into());
    let _ = PropVariantClear(&mut value);
    result
}

pub(super) fn sources() -> Result<Vec<CaptureSource>, String> {
    let _apartment = Apartment::new()?;
    let devices = enumerator()?;
    let mut result = Vec::new();
    unsafe {
        if let Ok(default) = devices.GetDefaultAudioEndpoint(eRender, eConsole) {
            result.push(CaptureSource {
                id: "default:render".into(),
                label: format!(
                    "System output — {} (current default)",
                    endpoint_name(&default)
                ),
                kind: "system",
                pid: None,
                active: false,
                endpoint_id: Some(take_string(default.GetId().map_err(message)?)),
                available: true,
                reason: None,
            });
        }
        let collection = devices
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .map_err(message)?;
        for index in 0..collection.GetCount().map_err(message)?.min(128) {
            let device = collection.Item(index).map_err(message)?;
            let id = take_string(device.GetId().map_err(message)?);
            result.push(CaptureSource {
                id: format!("endpoint:{id}"),
                label: format!("System output — {}", endpoint_name(&device)),
                kind: "system",
                pid: None,
                active: false,
                endpoint_id: Some(id.clone()),
                available: true,
                reason: None,
            });
            let manager: IAudioSessionManager2 =
                device.Activate(CLSCTX_ALL, None).map_err(message)?;
            let sessions = manager.GetSessionEnumerator().map_err(message)?;
            for index in 0..sessions.GetCount().map_err(message)?.min(1024) {
                let control = sessions.GetSession(index).map_err(message)?;
                let state = control.GetState().map_err(message)?;
                if state == AudioSessionStateExpired {
                    continue;
                }
                let active = state == AudioSessionStateActive;
                if active {
                    for source in result
                        .iter_mut()
                        .filter(|s| s.endpoint_id.as_deref() == Some(&id))
                    {
                        source.active = true;
                    }
                }
                let control: IAudioSessionControl2 = control.cast().map_err(message)?;
                let pid = control.GetProcessId().map_err(message)?;
                if let Some(existing) = result.iter_mut().find(|s| s.pid == Some(pid)) {
                    existing.active |= active;
                    continue;
                }
                if result.len() >= 1024 {
                    return Err("Too many audio sessions to enumerate safely".into());
                }
                match process(pid) {
                    Ok((_handle, created, name)) => result.push(CaptureSource {
                        id: format!("process:{pid}:{created}"),
                        label: format!("{name} (PID {pid}, process tree)"),
                        kind: "process",
                        pid: Some(pid),
                        active,
                        endpoint_id: None,
                        available: pid != std::process::id(),
                        reason: (pid == std::process::id()).then(|| {
                            "Harmonia's own playback is excluded to avoid feedback".into()
                        }),
                    }),
                    Err(_) => result.push(CaptureSource {
                        id: format!("unavailable:{pid}"),
                        label: format!("Application PID {pid}"),
                        kind: "process",
                        pid: Some(pid),
                        active,
                        endpoint_id: None,
                        available: false,
                        reason: Some(
                            "Process identity is inaccessible; refresh after it becomes available"
                                .into(),
                        ),
                    }),
                }
            }
        }
    }
    Ok(result)
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct ActivationHandler {
    completed: mpsc::SyncSender<()>,
    pending: Arc<AtomicBool>,
    // The PROPVARIANT refers to this stable allocation; Windows may finish after timeout.
    _parameters: Box<AUDIOCLIENT_ACTIVATION_PARAMS>,
}
impl IActivateAudioInterfaceCompletionHandler_Impl for ActivationHandler_Impl {
    fn ActivateCompleted(
        &self,
        _operation: Ref<'_, IActivateAudioInterfaceAsyncOperation>,
    ) -> ::windows::core::Result<()> {
        self.pending.store(false, Ordering::Release);
        let _ = self.completed.try_send(());
        Ok(())
    }
}

fn activate_process(
    pid: u32,
    stop: &AtomicBool,
    pending: Arc<AtomicBool>,
) -> Result<IAudioClient, String> {
    if pending.swap(true, Ordering::AcqRel) {
        return Err("Windows activation is still pending".into());
    }
    let mut parameters = Box::new(AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: pid,
                ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
            },
        },
    });
    let variant = borrowed_activation_variant(&mut parameters);
    let (sender, receiver) = mpsc::sync_channel(1);
    let handler: IActivateAudioInterfaceCompletionHandler = ActivationHandler {
        completed: sender,
        pending: pending.clone(),
        _parameters: parameters,
    }
    .into();
    let operation = match unsafe {
        ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&*variant),
            &handler,
        )
    } {
        Ok(operation) => operation,
        Err(error) => {
            pending.store(false, Ordering::Release);
            return Err(message(error));
        }
    };
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if stop.load(Ordering::Acquire) {
            return Err("Capture activation cancelled".into());
        }
        if Instant::now() >= deadline {
            return Err(
                "Windows process capture activation timed out; no system-audio fallback".into(),
            );
        }
        if receiver.recv_timeout(Duration::from_millis(20)).is_ok() {
            break;
        }
    }
    unsafe {
        let mut status = HRESULT(0);
        let mut unknown = None;
        operation
            .GetActivateResult(&mut status, &mut unknown)
            .map_err(message)?;
        status.ok().map_err(message)?;
        unknown
            .ok_or("Windows returned no audio client")?
            .cast()
            .map_err(message)
    }
}

fn borrowed_activation_variant(
    parameters: &mut AUDIOCLIENT_ACTIVATION_PARAMS,
) -> ManuallyDrop<PROPVARIANT> {
    // PROPVARIANT::drop invokes PropVariantClear, which owns/frees VT_BLOB memory.
    // This blob instead borrows the callback's Rust Box, including after timeout.
    // Only the callback owner may free it; never run the outer variant destructor.
    ManuallyDrop::new(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    blob: BLOB {
                        cbSize: size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                        pBlobData: (parameters as *mut AUDIOCLIENT_ACTIVATION_PARAMS).cast(),
                    },
                },
            }),
        },
    })
}

struct StartedClient(IAudioClient);
impl Drop for StartedClient {
    fn drop(&mut self) {
        unsafe {
            let _ = self.0.Stop();
        }
    }
}

pub(super) fn capture(
    source: SourceId,
    session: CaptureSession,
    stop: &AtomicBool,
    queue: &Mutex<CaptureQueue>,
    pending: Arc<AtomicBool>,
) -> Result<(), String> {
    let _apartment = Apartment::new()?;
    let mut process_handle = None;
    let diagnostics = std::env::var_os("HARMONIA_CAPTURE_DIAGNOSTICS").is_some();
    let device_positions_available = !matches!(source, SourceId::Process { .. });
    let client: IAudioClient = match source {
        SourceId::Process { pid, created } => {
            let (handle, actual_created, _) = process(pid)?;
            if actual_created != created
                || unsafe { WaitForSingleObject(handle.0, 0) } == WAIT_OBJECT_0
            {
                return Err(
                    "Selected process has exited or its identity changed; refresh sources".into(),
                );
            }
            process_handle = Some(handle);
            activate_process(pid, stop, pending)?
        }
        SourceId::Endpoint(id) => unsafe {
            let wide: Vec<_> = id.encode_utf16().chain(Some(0)).collect();
            enumerator()?
                .GetDevice(PCWSTR(wide.as_ptr()))
                .map_err(message)?
                .Activate(CLSCTX_ALL, None)
                .map_err(message)?
        },
        SourceId::Default => unsafe {
            enumerator()?
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(message)?
                .Activate(CLSCTX_ALL, None)
                .map_err(message)?
        },
    };
    if stop.load(Ordering::Acquire) {
        return Ok(());
    }
    let format = WAVEFORMATEX {
        wFormatTag: 3,
        nChannels: CHANNELS as u16,
        nSamplesPerSec: SAMPLE_RATE,
        nAvgBytesPerSec: SAMPLE_RATE * CHANNELS * 4,
        nBlockAlign: (CHANNELS * 4) as u16,
        wBitsPerSample: 32,
        cbSize: 0,
    };
    unsafe {
        client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK
                    | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                    | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                    | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                0,
                0,
                &format,
                None,
            )
            .map_err(message)?;
    }
    let event = OwnedHandle(unsafe { CreateEventW(None, false, false, None).map_err(message)? });
    let capture: IAudioCaptureClient = unsafe {
        client.SetEventHandle(event.0).map_err(message)?;
        client.GetService().map_err(message)?
    };
    unsafe {
        client.Start().map_err(message)?;
    }
    let _started = StartedClient(client);
    let mut assembler = Assembler::new(session);
    // Virtual process loopback can return device=0 on every packet even when
    // QPC advances normally. That position is unavailable, not repeated PCM loss.
    assembler.device_positions_available = device_positions_available;
    let mut diagnostic_packets = 0;
    let mut diagnostic_waits = 0;
    if diagnostics {
        eprintln!("capture diagnostic: client initialized and started");
    }
    while !stop.load(Ordering::Acquire) {
        if let Ok(queue) = queue.try_lock() {
            if queue.lease_expired(Instant::now()) {
                return Err("Capture connection expired: no PCM read for five seconds".into());
            }
        }
        if let Some(handle) = &process_handle {
            if unsafe { WaitForSingleObject(handle.0, 0) } == WAIT_OBJECT_0 {
                return Ok(());
            }
        }
        unsafe {
            WaitForSingleObject(event.0, 50);
        }
        if stop.load(Ordering::Acquire) {
            break;
        }
        loop {
            if stop.load(Ordering::Acquire) {
                break;
            }
            let next_packet_frames = unsafe { capture.GetNextPacketSize().map_err(message)? };
            if diagnostics && diagnostic_waits < 8 {
                diagnostic_waits += 1;
                eprintln!(
                    "capture diagnostic: poll={diagnostic_waits} next_frames={next_packet_frames}"
                );
            }
            if next_packet_frames == 0 {
                break;
            }
            let (mut data, mut frames, mut flags, mut device, mut qpc) =
                (std::ptr::null_mut(), 0, 0, 0, 0);
            unsafe {
                capture
                    .GetBuffer(
                        &mut data,
                        &mut frames,
                        &mut flags,
                        Some(&mut device),
                        Some(&mut qpc),
                    )
                    .map_err(message)?;
            }
            if frames == 0 {
                break;
            }
            // Copy before releasing, but never allocate from an unchecked native frame count.
            let copied = copy_packet(data, frames, flags);
            let released = unsafe { capture.ReleaseBuffer(frames).map_err(message) };
            let samples = copied?;
            released?;
            if diagnostics && diagnostic_packets < 8 {
                diagnostic_packets += 1;
                eprintln!("capture diagnostic: packet={diagnostic_packets} frames={frames} flags={flags} device={device} qpc={qpc} pending_frames={} blocks={} dropped={}", assembler.samples.len()/2, assembler.sequence, assembler.dropped);
            }
            assembler.packet(&samples, frames, flags, device, qpc, queue)?;
        }
    }
    Ok(())
}

fn copy_packet(data: *const u8, frames: u32, flags: u32) -> Result<Vec<f32>, String> {
    if frames > SAMPLE_RATE {
        return Err("Windows capture packet exceeds one-second safety limit".into());
    }
    let count = frames as usize * CHANNELS as usize;
    if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
        return Ok(vec![0.0; count]);
    }
    if data.is_null() {
        return Err("Windows returned a null audio packet".into());
    }
    // WASAPI supplied the complete float32 packet in the explicitly requested format.
    let values = unsafe { std::slice::from_raw_parts(data.cast::<f32>(), count) }.to_vec();
    if values.iter().any(|n| !n.is_finite()) {
        return Err("Windows returned non-finite PCM".into());
    }
    Ok(values)
}

struct Assembler {
    session: CaptureSession,
    samples: Vec<f32>,
    frame: u64,
    sequence: u64,
    device: Option<u64>,
    qpc: Option<u64>,
    valid: bool,
    silent: bool,
    gap: bool,
    dropped: u64,
    expected_device: Option<u64>,
    device_positions_available: bool,
}
impl Assembler {
    fn new(session: CaptureSession) -> Self {
        Self {
            session,
            samples: Vec::with_capacity(BLOCK_FRAMES as usize * 2),
            frame: 0,
            sequence: 0,
            device: None,
            qpc: None,
            valid: true,
            silent: true,
            gap: false,
            dropped: 0,
            expected_device: None,
            device_positions_available: true,
        }
    }
    fn packet(
        &mut self,
        samples: &[f32],
        frames: u32,
        flags: u32,
        device: u64,
        qpc: u64,
        queue: &Mutex<CaptureQueue>,
    ) -> Result<(), String> {
        let timestamp_valid = flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR.0 as u32 == 0;
        let discontinuity = flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32 != 0
            || self.expected_device.is_some_and(|expected| {
                self.device_positions_available && timestamp_valid && expected != device
            });
        if discontinuity {
            self.dropped += self.samples.len() as u64 / 2;
            self.samples.clear();
            if timestamp_valid && self.device_positions_available {
                if let Some(expected) = self.expected_device {
                    let missing = device.saturating_sub(expected);
                    self.frame += missing;
                    self.dropped += missing;
                }
            }
            self.gap = true;
        }
        self.expected_device = (timestamp_valid && self.device_positions_available)
            .then_some(device + u64::from(frames));
        // Timestamp uncertainty is not a PCM discontinuity. Preserve partial
        // samples, but invalidate the clock for any block containing such data.
        if !timestamp_valid {
            self.valid = false;
            self.device = None;
            self.qpc = None;
        }
        for offset in 0..frames as usize {
            if self.samples.is_empty() {
                self.device = (timestamp_valid && self.device_positions_available)
                    .then_some(device + offset as u64);
                self.qpc = timestamp_valid
                    .then_some(qpc + offset as u64 * 10_000_000 / u64::from(SAMPLE_RATE));
                self.valid = timestamp_valid;
                self.silent = true;
            }
            self.silent &= flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0;
            self.samples
                .extend_from_slice(&samples[offset * 2..offset * 2 + 2]);
            self.frame += 1;
            if self.samples.len() == BLOCK_FRAMES as usize * 2 {
                let block = PcmBlock {
                    session: self.session.clone(),
                    sequence: self.sequence,
                    first_frame: self.frame - u64::from(BLOCK_FRAMES),
                    frame_count: BLOCK_FRAMES,
                    device_position: self.device,
                    qpc100ns: self.qpc.map(|q| q.to_string()),
                    timestamp_valid: self.valid,
                    silent: self.silent,
                    discontinuity: self.gap,
                    dropped_frames_before: self.dropped,
                    samples: std::mem::replace(
                        &mut self.samples,
                        Vec::with_capacity(BLOCK_FRAMES as usize * 2),
                    ),
                };
                self.sequence += 1;
                match queue.try_lock() {
                    Ok(mut queue) => {
                        queue.push(block);
                        self.gap = false;
                        self.dropped = 0;
                    }
                    Err(std::sync::TryLockError::WouldBlock) => {
                        self.dropped += u64::from(BLOCK_FRAMES);
                        self.gap = true;
                    }
                    Err(_) => return Err("Capture queue unavailable".into()),
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn borrowed_activation_blob_cannot_free_callback_owned_parameters() {
        fn has_destructor<T>(_: &T) -> bool {
            std::mem::needs_drop::<T>()
        }
        let mut parameters = Box::new(AUDIOCLIENT_ACTIVATION_PARAMS::default());
        let expected = (&mut *parameters as *mut AUDIOCLIENT_ACTIVATION_PARAMS).cast::<u8>();
        let variant = borrowed_activation_variant(&mut parameters);
        let automatically_clears = has_destructor(&variant);
        // Suppress the old buggy destructor even on red: exercise the ownership contract
        // without deliberately corrupting the unit-test process heap.
        let variant = ManuallyDrop::new(variant);
        unsafe {
            assert_eq!(variant.Anonymous.Anonymous.vt, VT_BLOB);
            assert_eq!(
                variant.Anonymous.Anonymous.Anonymous.blob.pBlobData,
                expected
            );
            assert_eq!(
                variant.Anonymous.Anonymous.Anonymous.blob.cbSize,
                size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32
            );
        }
        assert!(
            !automatically_clears,
            "Borrowed activation blob must not run PropVariantClear"
        );
    }

    #[test]
    fn partial_packets_preserve_sample_order_and_first_frame_clock() {
        let queue = Mutex::new(CaptureQueue::new("test".into()));
        let mut assembler = Assembler::new(CaptureSession::new("test".into()));
        assembler
            .packet(&vec![0.25; 600], 300, 0, 100, 10000, &queue)
            .unwrap();
        assembler
            .packet(&vec![-0.5; 1320], 660, 0, 400, 72500, &queue)
            .unwrap();
        let block = queue.lock().unwrap().read().blocks.remove(0);
        assert_eq!(block.first_frame, 0);
        assert_eq!(block.device_position, Some(100));
        assert_eq!(block.qpc100ns.as_deref(), Some("10000"));
        assert_eq!(&block.samples[..600], vec![0.25; 600]);
        assert_eq!(&block.samples[600..], vec![-0.5; 1320]);
        assert!(!block.discontinuity);
    }

    #[test]
    fn discontinuity_discards_partial_audio_and_counts_missing_frames() {
        let queue = Mutex::new(CaptureQueue::new("test".into()));
        let mut assembler = Assembler::new(CaptureSession::new("test".into()));
        assembler
            .packet(&vec![0.25; 600], 300, 0, 100, 10000, &queue)
            .unwrap();
        assembler
            .packet(
                &vec![0.5; 1920],
                960,
                AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32,
                500,
                93000,
                &queue,
            )
            .unwrap();
        let block = queue.lock().unwrap().read().blocks.remove(0);
        assert_eq!(block.first_frame, 400);
        assert_eq!(block.dropped_frames_before, 400);
        assert!(block.discontinuity);
        assert!(block.samples.iter().all(|n| *n == 0.5));
    }

    #[test]
    fn contention_drops_pcm_without_blocking_and_carries_loss_to_next_block() {
        let queue = Mutex::new(CaptureQueue::new("test".into()));
        let mut assembler = Assembler::new(CaptureSession::new("test".into()));
        let held = queue.lock().unwrap();
        assembler
            .packet(&vec![0.25; 1920], 960, 0, 0, 10000, &queue)
            .unwrap();
        drop(held);
        assembler
            .packet(&vec![0.25; 1920], 960, 0, 960, 210000, &queue)
            .unwrap();
        let block = queue.lock().unwrap().read().blocks.remove(0);
        assert_eq!(block.sequence, 1);
        assert_eq!(block.dropped_frames_before, 960);
        assert!(block.discontinuity);
    }

    #[test]
    fn silent_packet_never_dereferences_pointer_and_invalid_lengths_fail() {
        assert_eq!(
            copy_packet(std::ptr::null(), 2, AUDCLNT_BUFFERFLAGS_SILENT.0 as u32).unwrap(),
            vec![0.0; 4]
        );
        assert!(copy_packet(
            std::ptr::null(),
            SAMPLE_RATE + 1,
            AUDCLNT_BUFFERFLAGS_SILENT.0 as u32
        )
        .is_err());
        assert!(copy_packet(std::ptr::null(), 1, 0).is_err());
        let data = [f32::NAN, 0.0];
        assert!(copy_packet(data.as_ptr().cast(), 1, 0).is_err());
    }

    #[test]
    fn timestamp_error_preserves_pcm_without_fabricated_clock() {
        let queue = Mutex::new(CaptureQueue::new("test".into()));
        let mut assembler = Assembler::new(CaptureSession::new("test".into()));
        assembler
            .packet(
                &vec![0.0; 1920],
                960,
                (AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR.0 | AUDCLNT_BUFFERFLAGS_SILENT.0) as u32,
                0,
                0,
                &queue,
            )
            .unwrap();
        let block = queue.lock().unwrap().read().blocks.remove(0);
        assert!(!block.discontinuity && block.silent && !block.timestamp_valid);
        assert_eq!(block.device_position, None);
        assert_eq!(block.qpc100ns, None);
    }

    #[test]
    fn uncertain_timestamps_do_not_discard_contiguous_short_pcm_packets() {
        let queue = Mutex::new(CaptureQueue::new("test".into()));
        let mut assembler = Assembler::new(CaptureSession::new("test".into()));
        for _ in 0..2 {
            assembler
                .packet(
                    &vec![0.25; 960],
                    480,
                    AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR.0 as u32,
                    0,
                    0,
                    &queue,
                )
                .unwrap();
        }
        let batch = queue.lock().unwrap().read();
        assert_eq!(
            batch.blocks.len(),
            1,
            "Clock uncertainty must not starve the PCM assembler"
        );
        let block = &batch.blocks[0];
        assert!(!block.timestamp_valid);
        assert_eq!(block.device_position, None);
        assert_eq!(block.qpc100ns, None);
        assert_eq!(block.dropped_frames_before, 0);
        assert_eq!(block.first_frame, 0);
    }

    #[test]
    fn virtual_process_clock_with_constant_zero_device_position_delivers_pcm() {
        let queue = Mutex::new(CaptureQueue::new("test".into()));
        let mut assembler = Assembler::new(CaptureSession::new("test".into()));
        assembler.device_positions_available = false;
        for packet in 0..4 {
            assembler
                .packet(
                    &vec![0.25; 960],
                    480,
                    0,
                    0,
                    2_187_392_182_995 + packet * 100_000,
                    &queue,
                )
                .unwrap();
        }
        let blocks = queue.lock().unwrap().read().blocks;
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].device_position, None);
        assert_eq!(blocks[0].qpc100ns.as_deref(), Some("2187392182995"));
        assert!(blocks[0].timestamp_valid);
        assert!(!blocks[0].discontinuity);
        assert_eq!(blocks[1].first_frame, 960);
        assert_eq!(blocks[1].dropped_frames_before, 0);
    }
}
