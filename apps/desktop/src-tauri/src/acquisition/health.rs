use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Failure {
    Invalid,
    Unsupported,
    Misconfigured,
    RateLimited(u64),
    Transient,
    Network,
    Corrupt,
    Cancelled,
}

#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub successes: u64,
    pub failures: u64,
    pub latency_ms: u64,
    pub recent_failures: u32,
    pub unavailable_until: u64,
    pub disabled: bool,
    pub rate_limited: bool,
    pub last_failure: Option<&'static str>,
    pub supported_format: Option<String>,
}
impl Health {
    pub fn available(&self, now: u64) -> bool {
        !self.disabled && now >= self.unavailable_until
    }
    pub fn success(&mut self, latency: u64, format: &str) {
        self.successes += 1;
        self.latency_ms += latency;
        self.recent_failures = 0;
        self.unavailable_until = 0;
        self.rate_limited = false;
        self.last_failure = None;
        self.supported_format = Some(format.into());
    }
    pub fn failure(&mut self, failure: Failure, now: u64) {
        if failure == Failure::Cancelled {
            return;
        }
        self.failures += 1;
        self.recent_failures += 1;
        self.last_failure = Some(match failure {
            Failure::Invalid => "invalid_request",
            Failure::Unsupported => "unsupported",
            Failure::Misconfigured => "misconfigured",
            Failure::RateLimited(_) => "rate_limited",
            Failure::Transient => "unavailable",
            Failure::Network => "network",
            Failure::Corrupt => "invalid_media",
            Failure::Cancelled => "cancelled",
        });
        match failure {
            Failure::Misconfigured => self.disabled = true,
            Failure::RateLimited(seconds) => {
                self.rate_limited = true;
                self.unavailable_until = now + seconds.clamp(1, 3600);
            }
            _ if self.recent_failures >= 3 => self.unavailable_until = now + 60,
            _ => {}
        }
    }
}
pub fn status_failure(status: u16, retry_after: Option<u64>, code: &str) -> Failure {
    match status {
        401 | 403 => Failure::Misconfigured,
        429 => Failure::RateLimited(retry_after.unwrap_or(60)),
        404 | 410 => Failure::Unsupported,
        400 if code.contains("UNSUPPORTED") || code.contains("INVALID_FORMAT") => {
            Failure::Unsupported
        }
        400 => Failure::Invalid,
        500 | 502 | 503 | 504 => Failure::Transient,
        _ => Failure::Unsupported,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_retry_auth_and_bad_requests() {
        assert_eq!(status_failure(400, None, "INVALID_URL"), Failure::Invalid);
        assert_eq!(
            status_failure(400, None, "UNSUPPORTED_PLATFORM"),
            Failure::Unsupported
        );
        assert_eq!(status_failure(401, None, ""), Failure::Misconfigured);
        assert_eq!(
            status_failure(429, Some(120), ""),
            Failure::RateLimited(120)
        );
        assert_eq!(status_failure(503, None, ""), Failure::Transient);
    }
    #[test]
    fn breaker_cools_down_and_reprobes() {
        let mut h = Health::default();
        for _ in 0..3 {
            h.failure(Failure::Transient, 10)
        }
        assert!(!h.available(69));
        assert!(h.available(70));
        h.success(12, "webm");
        assert_eq!(h.recent_failures, 0);
        h.failure(Failure::Misconfigured, 80);
        assert!(!h.available(100000));
    }
    #[test]
    fn cancellation_does_not_poison_health() {
        let mut h = Health::default();
        h.failure(Failure::Cancelled, 0);
        assert_eq!(h.failures, 0);
    }
}
