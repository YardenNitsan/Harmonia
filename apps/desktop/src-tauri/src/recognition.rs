//! Original audited pretrained inference, isolated from acquisition and playback.
//! Only bounded mono PCM crosses IPC. No frontend paths, commands or model downloads.
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    process::Stdio,
    sync::Mutex,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{watch, Semaphore},
};

const MAX_PCM: usize = 22050 * 1200 * 4;
// scripts/native-whole-song.py emits at most 16 MiB of JSON plus its final LF.
const MAX_RESPONSE: usize = 16 * 1024 * 1024 + 1;
const UNAVAILABLE: &str =
    "Whole-song recognition is unavailable. Check the local recognition runtime.";

pub fn validate_pcm(bytes: &[u8]) -> Result<usize, &'static str> {
    if bytes.is_empty() || bytes.len() > MAX_PCM || !bytes.len().is_multiple_of(4) {
        return Err("Invalid whole-song PCM size");
    }
    if bytes
        .chunks_exact(4)
        .any(|chunk| !f32::from_le_bytes(chunk.try_into().unwrap()).is_finite())
    {
        return Err("Invalid whole-song PCM samples");
    }
    Ok(bytes.len() / 4)
}

fn valid_request_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

#[derive(Default)]
struct Requests {
    active: HashMap<String, watch::Sender<bool>>,
    cancelled: VecDeque<String>,
}
pub struct RecognitionService {
    gate: Semaphore,
    requests: Mutex<Requests>,
}
impl Default for RecognitionService {
    fn default() -> Self {
        Self {
            gate: Semaphore::new(1),
            requests: Mutex::new(Requests::default()),
        }
    }
}
impl RecognitionService {
    pub fn cancel(&self, id: &str) {
        if !valid_request_id(id) {
            return;
        }
        if let Ok(mut requests) = self.requests.lock() {
            if let Some(sender) = requests.active.get(id) {
                let _ = sender.send(true);
            }
            if requests.cancelled.len() >= 32 {
                requests.cancelled.pop_front();
            }
            requests.cancelled.push_back(id.into());
        }
    }
    pub async fn recognize(&self, id: &str, bytes: Vec<u8>) -> Result<Value, String> {
        if !valid_request_id(id) {
            return Err("Invalid recognition request".into());
        }
        if bytes.len() > MAX_PCM {
            return Err("Recording exceeds recognition bounds".into());
        }
        let mut receiver = {
            let mut requests = self.requests.lock().map_err(|_| UNAVAILABLE)?;
            if requests.cancelled.iter().any(|s| s == id) {
                return Err("Recognition cancelled".into());
            }
            if requests.active.len() >= 2 || requests.active.contains_key(id) {
                return Err("Recognition is busy".into());
            }
            let (sender, receiver) = watch::channel(false);
            requests.active.insert(id.into(), sender);
            receiver
        };
        let result = tokio::select! {
            _ = receiver.changed() => Err("Recognition cancelled".into()),
            result = tokio::time::timeout(Duration::from_secs(240), self.run(bytes)) =>
                result.unwrap_or_else(|_| Err("Whole-song recognition timed out".into())),
        };
        if let Ok(mut requests) = self.requests.lock() {
            requests.active.remove(id);
        }
        result
    }
    async fn run(&self, bytes: Vec<u8>) -> Result<Value, String> {
        let _permit = self.gate.acquire().await.map_err(|_| UNAVAILABLE)?;
        let (bytes, samples) =
            tauri::async_runtime::spawn_blocking(move || validate_pcm(&bytes).map(|n| (bytes, n)))
                .await
                .map_err(|_| UNAVAILABLE)??;
        // This configured development PC already owns the pinned scientific runtime.
        // Packaging that runtime is a separate gate; never silently use a different model.
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let python = std::env::var_os("HARMONIA_RECOGNITION_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| root.join("ml/.venv/Scripts/python.exe"));
        let script = root.join("scripts/native-whole-song.py");
        if !python.is_file() || !script.is_file() {
            return Err(UNAVAILABLE.into());
        }
        let mut command = tokio::process::Command::new(python);
        command
            .arg("-I")
            .arg(script)
            .arg("--samples")
            .arg(samples.to_string())
            .current_dir(root.join("ml"))
            .env("OMP_NUM_THREADS", "2")
            .env("MKL_NUM_THREADS", "2")
            .env("OPENBLAS_NUM_THREADS", "2")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let child = command.spawn().map_err(|_| UNAVAILABLE)?;
        let output = exchange_pcm(child, &bytes).await?;
        let result: Value =
            serde_json::from_slice(&output).map_err(|_| "Invalid recognition response")?;
        if result.get("schemaVersion").and_then(Value::as_u64) != Some(1)
            || result.get("sampleCount").and_then(Value::as_u64) != Some(samples as u64)
        {
            return Err("Recognition input identity mismatch".into());
        }
        Ok(result)
    }
}

async fn exchange_pcm(mut child: tokio::process::Child, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut input = child.stdin.take().ok_or(UNAVAILABLE)?;
    let output = child.stdout.take().ok_or(UNAVAILABLE)?;
    // Concurrent bounded pipe I/O avoids deadlock. Dropping this future kills the
    // owned Python process on cancellation/timeout, including its native threads.
    let send = async move {
        input.write_all(bytes).await?;
        input.flush().await?;
        // ChildStdin::shutdown is a no-op for Windows pipes. Closing the
        // owned handle delivers EOF to Python's bounded expected+1 read.
        drop(input);
        Ok::<_, std::io::Error>(())
    };
    let receive = async {
        let mut buffer = Vec::new();
        output
            .take((MAX_RESPONSE + 1) as u64)
            .read_to_end(&mut buffer)
            .await?;
        Ok::<_, std::io::Error>(buffer)
    };
    let (_, output) = tokio::try_join!(send, receive).map_err(|_| UNAVAILABLE)?;
    if output.len() > MAX_RESPONSE {
        return Err("Recognition response exceeds bounds".into());
    }
    if !child.wait().await.map_err(|_| UNAVAILABLE)?.success() {
        return Err(UNAVAILABLE.into());
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Spawn this test executable itself: exercise actual OS pipes without a Python
    // installation, model downloads, network access or scientific inference.
    fn pipe_probe(mode: &str) -> tokio::process::Child {
        let mut command = tokio::process::Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "recognition::tests::pipe_probe_child",
                "--nocapture",
            ])
            .env("HARMONIA_TEST_PIPE_MODE", mode)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        command.spawn().unwrap()
    }

    #[test]
    fn pipe_probe_child() {
        use std::io::{Read, Write};
        let Ok(mode) = std::env::var("HARMONIA_TEST_PIPE_MODE") else {
            return;
        };
        if mode == "eof" {
            // Like Python read_pcm: request one more byte to reject excess input.
            let mut input = Vec::new();
            std::io::stdin().take(5).read_to_end(&mut input).unwrap();
            assert_eq!(input, [1, 2, 3, 4]);
            std::io::stdout().write_all(b"PCM-EOF-RECEIVED").unwrap();
        } else {
            let chunks = if mode == "large" { 9 * 256 } else { 17 * 256 };
            let mut output = std::io::stdout().lock();
            for _ in 0..chunks {
                output.write_all(&[b'x'; 4096]).unwrap();
            }
        }
    }

    #[tokio::test]
    async fn pipe_exchange_closes_stdin_before_waiting_for_response() {
        let output = tokio::time::timeout(
            Duration::from_secs(3),
            exchange_pcm(pipe_probe("eof"), &[1, 2, 3, 4]),
        )
        .await
        .expect("child must receive EOF before producing its response")
        .unwrap();
        assert!(String::from_utf8_lossy(&output).contains("PCM-EOF-RECEIVED"));
    }

    #[tokio::test]
    async fn pipe_exchange_accepts_response_above_eight_mib_within_protocol_bound() {
        let output = tokio::time::timeout(
            Duration::from_secs(5),
            exchange_pcm(pipe_probe("large"), &[]),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(output.len() >= 9 * 1024 * 1024);
    }

    #[tokio::test]
    async fn pipe_exchange_rejects_response_above_sixteen_mib() {
        let error = tokio::time::timeout(
            Duration::from_secs(5),
            exchange_pcm(pipe_probe("oversize"), &[]),
        )
        .await
        .unwrap()
        .unwrap_err();
        assert!(error.contains("exceeds bounds"));
    }

    #[tokio::test]
    async fn invalid_cancellation_ids_cannot_evict_a_valid_early_cancellation() {
        let service = RecognitionService::default();
        let valid_id = "a".repeat(80);
        service.cancel(&valid_id);
        for _ in 0..33 {
            for invalid in ["", "../bad", &"a".repeat(81)] {
                service.cancel(invalid);
            }
        }
        assert!(service
            .recognize(&valid_id, vec![])
            .await
            .unwrap_err()
            .contains("cancelled"));
        assert_eq!(service.requests.lock().unwrap().cancelled.len(), 1);
    }
    #[tokio::test]
    async fn early_cancellation_prevents_process_launch() {
        let service = RecognitionService::default();
        service.cancel("cancel-before-register");
        assert!(service
            .recognize("cancel-before-register", vec![0; 4])
            .await
            .unwrap_err()
            .contains("cancelled"));
        assert!(service
            .recognize("../bad", vec![0; 4])
            .await
            .unwrap_err()
            .contains("Invalid"));
        assert!(service.requests.lock().unwrap().active.is_empty());
    }
}
