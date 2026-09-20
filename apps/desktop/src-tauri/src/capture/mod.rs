mod windows;

use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u32 = 2;
pub const BLOCK_FRAMES: u32 = 960;
const QUEUE_BLOCKS: usize = 12;
const READ_BLOCKS: usize = 4;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    pub id: String,
    pub label: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint_id: Option<String>,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSession {
    pub capture_id: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub block_frames: u32,
}
impl CaptureSession {
    fn new(capture_id: String) -> Self {
        Self {
            capture_id,
            sample_rate: SAMPLE_RATE,
            channels: CHANNELS,
            block_frames: BLOCK_FRAMES,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PcmBlock {
    #[serde(flatten)]
    pub session: CaptureSession,
    pub sequence: u64,
    pub first_frame: u64,
    pub frame_count: u32,
    pub device_position: Option<u64>,
    pub qpc100ns: Option<String>,
    pub timestamp_valid: bool,
    pub silent: bool,
    pub discontinuity: bool,
    pub dropped_frames_before: u64,
    pub samples: Vec<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBatch {
    pub capture_id: String,
    pub status: &'static str,
    pub blocks: Vec<PcmBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

struct CaptureQueue {
    id: String,
    blocks: VecDeque<PcmBlock>,
    status: &'static str,
    error: Option<String>,
    dropped: u64,
    last_read: Instant,
}
impl CaptureQueue {
    fn new(id: String) -> Self {
        Self {
            id,
            blocks: VecDeque::with_capacity(QUEUE_BLOCKS),
            status: "capturing",
            error: None,
            dropped: 0,
            last_read: Instant::now(),
        }
    }
    fn push(&mut self, block: PcmBlock) {
        if self.status != "capturing" {
            return;
        }
        if self.blocks.len() == QUEUE_BLOCKS {
            if let Some(old) = self.blocks.pop_front() {
                self.dropped += u64::from(old.frame_count) + old.dropped_frames_before;
            }
        }
        self.blocks.push_back(block);
    }
    fn read(&mut self) -> CaptureBatch {
        self.read_at(Instant::now())
    }
    fn lease_expired(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.last_read) >= Duration::from_secs(5)
    }
    fn read_at(&mut self, now: Instant) -> CaptureBatch {
        if self.status == "capturing" {
            if self.lease_expired(now) {
                self.finish(
                    "error",
                    Some("Capture connection expired: no PCM read for five seconds".into()),
                );
            } else {
                self.last_read = now;
            }
        }
        let mut blocks: Vec<_> = self
            .blocks
            .drain(..self.blocks.len().min(READ_BLOCKS))
            .collect();
        if let Some(first) = blocks.first_mut() {
            if self.dropped > 0 {
                first.dropped_frames_before += std::mem::take(&mut self.dropped);
                first.discontinuity = true;
            }
        }
        CaptureBatch {
            capture_id: self.id.clone(),
            status: self.status,
            blocks,
            error: self.error.clone(),
        }
    }
    fn finish(&mut self, status: &'static str, error: Option<String>) {
        if self.status == "stopped" {
            return;
        }
        self.status = status;
        self.error = error;
        self.blocks.clear();
    }
}

#[derive(Debug, PartialEq)]
enum SourceId {
    Process { pid: u32, created: u64 },
    Endpoint(String),
    Default,
}
impl SourceId {
    fn parse(value: &str) -> Result<Self, String> {
        if value.len() > 2048 || value.contains('\0') {
            return Err("Invalid capture source".into());
        }
        if value == "default:render" {
            return Ok(Self::Default);
        }
        if let Some(id) = value.strip_prefix("endpoint:").filter(|id| !id.is_empty()) {
            return Ok(Self::Endpoint(id.into()));
        }
        if let Some(parts) = value.strip_prefix("process:") {
            let parts: Vec<_> = parts.split(':').collect();
            if parts.len() == 2 {
                if let (Ok(pid), Ok(created)) = (parts[0].parse::<u32>(), parts[1].parse::<u64>()) {
                    if pid > 0 && created > 0 {
                        return Ok(Self::Process { pid, created });
                    }
                }
            }
        }
        Err("Invalid capture source".into())
    }
}

struct ActiveCapture {
    session: CaptureSession,
    stop: Arc<AtomicBool>,
    queue: Arc<Mutex<CaptureQueue>>,
    thread: JoinHandle<()>,
}
#[derive(Default)]
pub struct CaptureService {
    active: Mutex<Option<ActiveCapture>>,
    activation_pending: Arc<AtomicBool>,
    sequence: AtomicU64,
}
impl CaptureService {
    pub fn sources(&self) -> Result<Vec<CaptureSource>, String> {
        windows::sources()
    }

    pub fn start(&self, source_id: &str) -> Result<CaptureSession, String> {
        let source = SourceId::parse(source_id)?;
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Capture state unavailable")?;
        if let Some(previous) = active.as_ref() {
            previous.stop.store(true, Ordering::Release);
            previous
                .queue
                .lock()
                .map_err(|_| "Capture queue unavailable")?
                .finish("stopped", None);
            if !previous.thread.is_finished() {
                return Err("Previous capture is stopping; retry shortly".into());
            }
        }
        if let Some(previous) = active.take() {
            let _ = previous.thread.join();
        }
        if self.activation_pending.load(Ordering::Acquire) {
            return Err("Windows activation is still pending".into());
        }
        let id = format!(
            "capture-{}-{}",
            std::process::id(),
            self.sequence.fetch_add(1, Ordering::Relaxed) + 1
        );
        let session = CaptureSession::new(id.clone());
        let stop = Arc::new(AtomicBool::new(false));
        let queue = Arc::new(Mutex::new(CaptureQueue::new(id)));
        let (worker_stop, worker_queue, worker_session, pending) = (
            stop.clone(),
            queue.clone(),
            session.clone(),
            self.activation_pending.clone(),
        );
        let handle = thread::Builder::new()
            .name("harmonia-pcm-capture".into())
            .spawn(move || {
                let result =
                    windows::capture(source, worker_session, &worker_stop, &worker_queue, pending);
                if let Ok(mut queue) = worker_queue.lock() {
                    if worker_stop.load(Ordering::Acquire) {
                        queue.finish("stopped", None);
                    } else {
                        match result {
                            Ok(()) => queue.finish("ended", None),
                            Err(error) => queue.finish("error", Some(error)),
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        *active = Some(ActiveCapture {
            session: session.clone(),
            stop,
            queue,
            thread: handle,
        });
        Ok(session)
    }

    pub fn read(&self, id: &str) -> Result<CaptureBatch, String> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Capture state unavailable")?;
        let active = active
            .as_ref()
            .filter(|a| a.session.capture_id == id)
            .ok_or("Unknown capture session")?;
        let result = active
            .queue
            .lock()
            .map_err(|_| "Capture queue unavailable")?
            .read();
        Ok(result)
    }

    pub fn stop(&self, id: &str) -> Result<(), String> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Capture state unavailable")?;
        // A stale stop is harmless and must not affect a replacement session.
        let Some(active) = active.as_ref().filter(|a| a.session.capture_id == id) else {
            return Ok(());
        };
        active.stop.store(true, Ordering::Release);
        active
            .queue
            .lock()
            .map_err(|_| "Capture queue unavailable")?
            .finish("stopped", None);
        let deadline = Instant::now() + Duration::from_secs(1);
        while !active.thread.is_finished() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        if !active.thread.is_finished() {
            return Err("Capture shutdown is still pending".into());
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        let id = self
            .active
            .lock()
            .ok()
            .and_then(|a| a.as_ref().map(|a| a.session.capture_id.clone()));
        if let Some(id) = id {
            let _ = self.stop(&id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_bounds_drop_oldest_and_expose_gap_on_next_delivered_block() {
        let mut queue = CaptureQueue::new("test".into());
        for index in 0..14 {
            queue.push(block(index));
        }
        assert_eq!(queue.blocks.len(), 12);
        let batch = queue.read();
        assert_eq!(batch.blocks.len(), 4);
        assert_eq!(batch.blocks[0].sequence, 2);
        assert_eq!(batch.blocks[0].dropped_frames_before, 1920);
        assert!(batch.blocks[0].discontinuity);
        assert_eq!(queue.blocks.len(), 8);
    }

    #[test]
    fn stopping_discards_pcm_and_cannot_publish_late_blocks() {
        let mut queue = CaptureQueue::new("test".into());
        queue.push(block(0));
        queue.finish("stopped", None);
        queue.push(block(1));
        let batch = queue.read();
        assert_eq!(batch.status, "stopped");
        assert!(batch.blocks.is_empty());
    }

    #[test]
    fn consumer_lease_expires_and_successful_read_renews_it() {
        let mut queue = CaptureQueue::new("test".into());
        let start = queue.last_read;
        assert!(!queue.lease_expired(start + Duration::from_millis(4999)));
        assert!(queue.lease_expired(start + Duration::from_secs(5)));
        queue.read_at(start + Duration::from_secs(4));
        assert!(!queue.lease_expired(start + Duration::from_secs(8)));
        assert!(queue.lease_expired(start + Duration::from_secs(9)));
    }

    #[test]
    fn late_read_cannot_revive_expired_capture() {
        let mut queue = CaptureQueue::new("test".into());
        queue.push(block(0));
        let late = queue.last_read + Duration::from_secs(5);
        let batch = queue.read_at(late);
        assert_eq!(batch.status, "error");
        assert!(batch.blocks.is_empty());
        assert!(batch.error.unwrap().contains("expired"));
    }

    #[test]
    fn stale_stop_cannot_stop_replacement_and_shutdown_joins_cooperative_worker() {
        let service = CaptureService::default();
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let handle = thread::spawn(move || {
            while !thread_stop.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(1));
            }
        });
        *service.active.lock().unwrap() = Some(ActiveCapture {
            session: CaptureSession::new("current".into()),
            stop: stop.clone(),
            queue: Arc::new(Mutex::new(CaptureQueue::new("current".into()))),
            thread: handle,
        });
        service.stop("previous").unwrap();
        assert!(!stop.load(Ordering::Acquire));
        assert!(service.read("previous").is_err());
        service.stop("current").unwrap();
        assert!(stop.load(Ordering::Acquire));
        assert!(service
            .active
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .thread
            .is_finished());
        assert_eq!(service.read("current").unwrap().status, "stopped");
    }

    #[test]
    fn process_source_requires_pid_and_creation_time() {
        assert_eq!(
            SourceId::parse("process:42:1234").unwrap(),
            SourceId::Process {
                pid: 42,
                created: 1234
            }
        );
        for value in [
            "process:42",
            "process:0:1234",
            "process:42:0",
            "process:42:1234:extra",
            "endpoint:",
            "default:invalid",
        ] {
            assert!(SourceId::parse(value).is_err(), "{value}");
        }
        assert!(SourceId::parse(&"x".repeat(2049)).is_err());
    }

    fn block(sequence: u64) -> PcmBlock {
        PcmBlock {
            session: CaptureSession::new("test".into()),
            sequence,
            first_frame: sequence * 960,
            frame_count: 960,
            device_position: Some(sequence * 960),
            qpc100ns: Some("1234".into()),
            timestamp_valid: true,
            silent: false,
            discontinuity: false,
            dropped_frames_before: 0,
            samples: vec![0.25; 1920],
        }
    }
}
