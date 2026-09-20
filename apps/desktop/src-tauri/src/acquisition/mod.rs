//! Whole-file acquisition is isolated from recognition and playback. No raw keys,
//! provider response bodies or signed download URLs cross the IPC boundary.
mod cache;
mod health;
mod providers;
use cache::{now, Cache};
use health::{Failure, Health};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::{watch, Semaphore};

const ORDER: [&str; 3] = ["yt-dlp", "cobalt", "saveapi"];
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio {
    pub provider: String,
    pub video_id: String,
    pub title: String,
    pub duration: Option<f64>,
    pub mime: String,
    pub container: String,
    pub cache_token: String,
    pub fingerprint: String,
    pub byte_length: u64,
    pub cached: bool,
    pub acquisition_ms: u64,
    #[serde(default, skip_serializing_if = "is_zero")]
    last_access: u64,
}
fn is_zero(value: &u64) -> bool {
    *value == 0
}
impl Audio {
    fn new(provider: &str, video: &str, title: &str, duration: Option<f64>, ms: u64) -> Self {
        Self {
            provider: provider.into(),
            video_id: video.into(),
            title: title.into(),
            duration,
            mime: String::new(),
            container: String::new(),
            cache_token: String::new(),
            fingerprint: String::new(),
            byte_length: 0,
            cached: false,
            acquisition_ms: ms,
            last_access: now(),
        }
    }
}
#[derive(Debug, Serialize)]
pub struct AcquisitionError {
    pub code: &'static str,
    pub message: &'static str,
}
fn error(f: Failure) -> AcquisitionError {
    AcquisitionError {
        code: match f {
            Failure::Invalid => "invalid_request",
            Failure::Cancelled => "cancelled",
            Failure::Misconfigured => "unconfigured",
            _ => "unavailable",
        },
        message: if f == Failure::Cancelled {
            "Preparation cancelled."
        } else {
            "This song could not be prepared right now. Try again later."
        },
    }
}
#[derive(Default)]
struct Requests {
    active: HashMap<String, watch::Sender<bool>>,
    cancelled: VecDeque<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    provider: &'static str,
    configured: bool,
    available: bool,
    success_rate: f64,
    failure_rate: f64,
    average_acquisition_ms: f64,
    #[serde(flatten)]
    health: Health,
}
pub struct AcquisitionService {
    cache: Cache,
    client: reqwest::Client,
    health: Mutex<HashMap<&'static str, Health>>,
    requests: Mutex<Requests>,
    gate: Semaphore,
}
impl AcquisitionService {
    pub fn new(root: PathBuf) -> Result<Self, AcquisitionError> {
        let cache = Cache::new(root).map_err(error)?;
        cache.cleanup(None);
        Ok(Self {
            cache,
            client: providers::client().map_err(error)?,
            health: Mutex::new(ORDER.into_iter().map(|p| (p, Health::default())).collect()),
            requests: Mutex::new(Requests::default()),
            gate: Semaphore::new(1),
        })
    }
    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        let Ok(health) = self.health.lock() else {
            return vec![];
        };
        ORDER
            .into_iter()
            .map(|provider| {
                let h = health.get(provider).cloned().unwrap_or_default();
                let n = (h.successes + h.failures) as f64;
                Diagnostic {
                    provider,
                    configured: providers::configured(provider),
                    available: h.available(now()),
                    success_rate: if n == 0.0 {
                        0.0
                    } else {
                        h.successes as f64 / n
                    },
                    failure_rate: if n == 0.0 { 0.0 } else { h.failures as f64 / n },
                    average_acquisition_ms: if h.successes == 0 {
                        0.0
                    } else {
                        h.latency_ms as f64 / h.successes as f64
                    },
                    health: h,
                }
            })
            .collect()
    }
    pub fn cancel(&self, id: &str) {
        if let Ok(mut requests) = self.requests.lock() {
            if let Some(sender) = requests.active.get(id) {
                let _ = sender.send(true);
            }
            if requests.cancelled.len() >= 64 {
                requests.cancelled.pop_front();
            }
            requests.cancelled.push_back(id.chars().take(80).collect());
        }
    }
    pub fn shutdown(&self) {
        if let Ok(requests) = self.requests.lock() {
            for sender in requests.active.values() {
                let _ = sender.send(true);
            }
        }
    }
    pub fn read(
        &self,
        token: &str,
        offset: u64,
        length: usize,
    ) -> Result<Vec<u8>, AcquisitionError> {
        self.cache.read(token, offset, length).map_err(error)
    }
    pub fn reject(&self, token: &str) -> Result<(), AcquisitionError> {
        if let Some(provider) = self.cache.reject(token).map_err(error)? {
            if let Ok(mut health) = self.health.lock() {
                if let Some(h) = health.get_mut(provider.as_str()) {
                    h.failure(Failure::Corrupt, now());
                }
            }
        }
        Ok(())
    }
    pub async fn acquire(
        &self,
        video: &str,
        id: &str,
        exclude: Vec<String>,
    ) -> Result<Audio, AcquisitionError> {
        if video.len() != 11
            || !video
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            || id.is_empty()
            || id.len() > 80
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            || exclude.len() > 3
            || exclude.iter().any(|p| !ORDER.contains(&p.as_str()))
        {
            return Err(error(Failure::Invalid));
        }
        let mut cancel = {
            let mut requests = self
                .requests
                .lock()
                .map_err(|_| error(Failure::Transient))?;
            if requests.cancelled.iter().any(|s| s == id) {
                return Err(error(Failure::Cancelled));
            }
            if requests.active.len() >= 4 || requests.active.contains_key(id) {
                return Err(error(Failure::Transient));
            }
            let (tx, rx) = watch::channel(false);
            requests.active.insert(id.into(), tx);
            rx
        };
        let result = tokio::select! {_ = cancel.changed()=>Err(error(Failure::Cancelled)),result=tokio::time::timeout(Duration::from_secs(210),self.run(video,&exclude))=>result.unwrap_or_else(|_|Err(error(Failure::Transient)))};
        if let Ok(mut requests) = self.requests.lock() {
            requests.active.remove(id);
        }
        result
    }
    async fn run(&self, video: &str, exclude: &[String]) -> Result<Audio, AcquisitionError> {
        let _permit = self
            .gate
            .acquire()
            .await
            .map_err(|_| error(Failure::Cancelled))?;
        if let Some(a) = self.cache.get(video, exclude) {
            return Ok(a);
        }
        let enabled: Vec<_> = ORDER
            .into_iter()
            .filter(|p| !exclude.iter().any(|x| x == p) && providers::configured(p))
            .collect();
        run_chain(&self.health, &enabled, |provider| async move {
            let dir = tempfile::Builder::new()
                .prefix("job-")
                .tempdir_in(self.cache.root())
                .map_err(|_| Failure::Network)?;
            let result = tokio::time::timeout(
                Duration::from_secs(90),
                providers::acquire(provider, video, dir.path(), &self.client),
            )
            .await
            .map_err(|_| Failure::Network)??;
            self.cache.publish(&result.0, result.1)
        })
        .await
        .map_err(error)
    }
}
async fn run_chain<F, Fut>(
    health: &Mutex<HashMap<&'static str, Health>>,
    enabled: &[&'static str],
    mut attempt: F,
) -> Result<Audio, Failure>
where
    F: FnMut(&'static str) -> Fut,
    Fut: std::future::Future<Output = Result<Audio, Failure>>,
{
    for provider in ORDER {
        if !enabled.contains(&provider)
            || !health
                .lock()
                .map_err(|_| Failure::Network)?
                .get(provider)
                .is_some_and(|h| h.available(now()))
        {
            continue;
        }
        let started = Instant::now();
        match run_with_retry(|| attempt(provider)).await {
            Ok(mut audio) => {
                audio.acquisition_ms = started.elapsed().as_millis() as u64;
                if let Ok(mut health) = health.lock() {
                    if let Some(h) = health.get_mut(provider) {
                        h.success(audio.acquisition_ms, &audio.container);
                    }
                }
                return Ok(audio);
            }
            Err(f) => {
                if let Ok(mut health) = health.lock() {
                    if let Some(h) = health.get_mut(provider) {
                        h.failure(f, now());
                    }
                }
                if matches!(f, Failure::Invalid | Failure::Cancelled) {
                    return Err(f);
                }
            }
        }
    }
    Err(Failure::Unsupported)
}
async fn run_with_retry<T, F, Fut>(mut run: F) -> Result<T, Failure>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, Failure>>,
{
    for attempt in 0..2 {
        match run().await {
            Err(Failure::Transient) if attempt == 0 => {
                tokio::time::sleep(Duration::from_millis(250)).await
            }
            Err(Failure::RateLimited(seconds)) if attempt == 0 && seconds <= 2 => {
                tokio::time::sleep(Duration::from_secs(seconds)).await
            }
            result => return result,
        }
    }
    Err(Failure::Transient)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn bounded_retry_and_rate_limit_classification() {
        let mut calls = 0;
        let result = run_with_retry(|| {
            calls += 1;
            std::future::ready(if calls == 1 {
                Err(Failure::Transient)
            } else {
                Ok(42)
            })
        })
        .await;
        assert_eq!(result, Ok(42));
        assert_eq!(calls, 2);
        let mut calls = 0;
        let result: Result<(), _> = run_with_retry(|| {
            calls += 1;
            std::future::ready(Err(Failure::RateLimited(120)))
        })
        .await;
        assert_eq!(result, Err(Failure::RateLimited(120)));
        assert_eq!(calls, 1);
    }
    #[tokio::test]
    async fn actual_chain_retries_then_falls_through_corrupt_second_to_third() {
        let health = Mutex::new(ORDER.into_iter().map(|p| (p, Health::default())).collect());
        let mut attempted = vec![];
        let audio = run_chain(&health, &ORDER, |p| {
            attempted.push(p);
            std::future::ready(match p {
                "yt-dlp" => Err(Failure::Transient),
                "cobalt" => Err(Failure::Corrupt),
                _ => Ok(Audio::new(p, "abcdefghijk", "song", None, 0)),
            })
        })
        .await
        .unwrap();
        assert_eq!(audio.provider, "saveapi");
        assert_eq!(attempted, vec!["yt-dlp", "yt-dlp", "cobalt", "saveapi"]);
        assert_eq!(health.lock().unwrap()["yt-dlp"].failures, 1);
        assert_eq!(
            health.lock().unwrap()["cobalt"].last_failure,
            Some("invalid_media")
        );
    }
    #[tokio::test]
    async fn actual_chain_skips_disabled_auth_and_rate_limited_but_stops_invalid_request() {
        let health = Mutex::new(ORDER.into_iter().map(|p| (p, Health::default())).collect());
        let mut attempted = vec![];
        let _ = run_chain(&health, &ORDER, |p| {
            attempted.push(p);
            std::future::ready(match p {
                "yt-dlp" => Err(Failure::Misconfigured),
                "cobalt" => Err(Failure::RateLimited(120)),
                _ => Ok(Audio::new(p, "abcdefghijk", "song", None, 0)),
            })
        })
        .await
        .unwrap();
        assert_eq!(attempted, ORDER);
        attempted.clear();
        let _ = run_chain(&health, &ORDER, |p| {
            attempted.push(p);
            std::future::ready(Ok(Audio::new(p, "abcdefghijk", "song", None, 0)))
        })
        .await
        .unwrap();
        assert_eq!(attempted, vec!["saveapi"]);
        let health = Mutex::new(ORDER.into_iter().map(|p| (p, Health::default())).collect());
        attempted.clear();
        let err = run_chain(&health, &ORDER, |p| {
            attempted.push(p);
            std::future::ready(Err(Failure::Invalid))
        })
        .await
        .unwrap_err();
        assert_eq!(err, Failure::Invalid);
        assert_eq!(attempted, vec!["yt-dlp"]);
    }
    #[tokio::test]
    async fn network_failure_goes_directly_to_next_provider() {
        let health = Mutex::new(ORDER.into_iter().map(|p| (p, Health::default())).collect());
        let mut attempted = vec![];
        let _ = run_chain(&health, &ORDER, |p| {
            attempted.push(p);
            std::future::ready(if p == "yt-dlp" {
                Err(Failure::Network)
            } else {
                Ok(Audio::new(p, "abcdefghijk", "song", None, 0))
            })
        })
        .await
        .unwrap();
        assert_eq!(attempted, vec!["yt-dlp", "cobalt"]);
    }
    #[tokio::test]
    async fn strict_identifiers_and_cancel_before_acquire() {
        let dir = tempfile::tempdir().unwrap();
        let service = AcquisitionService::new(dir.path().to_path_buf()).unwrap();
        assert_eq!(
            service
                .acquire("../escape", "request", vec![])
                .await
                .unwrap_err()
                .code,
            "invalid_request"
        );
        service.cancel("cancelled-request");
        assert_eq!(
            service
                .acquire("gHKT4uU8Zng", "cancelled-request", vec![])
                .await
                .unwrap_err()
                .code,
            "cancelled"
        );
    }
    #[tokio::test]
    #[ignore = "explicit native integration downloads official yt-dlp test recording"]
    async fn configured_live_acquisition() {
        let dir = tempfile::tempdir().unwrap();
        let service = AcquisitionService::new(dir.path().to_path_buf()).unwrap();
        let start = Instant::now();
        let audio = service
            .acquire("gHKT4uU8Zng", "native-fixture", vec![])
            .await
            .unwrap();
        assert!(audio.byte_length > 1024);
        assert_eq!(audio.provider, "yt-dlp");
        let first = start.elapsed();
        let start = Instant::now();
        let cached = service
            .acquire("gHKT4uU8Zng", "native-cache", vec![])
            .await
            .unwrap();
        assert!(cached.cached);
        assert_eq!(cached.fingerprint, audio.fingerprint);
        println!(
            "native acquisition provider={} container={} bytes={} first_ms={} cached_ms={}",
            audio.provider,
            audio.container,
            audio.byte_length,
            first.as_millis(),
            start.elapsed().as_millis()
        );
    }
    #[tokio::test]
    #[ignore = "requires explicitly started private Cobalt instance"]
    async fn configured_cobalt_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let service = AcquisitionService::new(dir.path().to_path_buf()).unwrap();
        // Simulate an open primary circuit; production rank selection must use Cobalt.
        service
            .health
            .lock()
            .unwrap()
            .get_mut("yt-dlp")
            .unwrap()
            .failure(Failure::Misconfigured, now());
        let started = Instant::now();
        let audio = service
            .acquire("gHKT4uU8Zng", "native-cobalt", vec![])
            .await
            .unwrap();
        assert_eq!(audio.provider, "cobalt");
        assert!(audio.byte_length > 1000);
        println!(
            "native fallback provider={} container={} bytes={} acquisition_ms={}",
            audio.provider,
            audio.container,
            audio.byte_length,
            started.elapsed().as_millis()
        );
    }
}
