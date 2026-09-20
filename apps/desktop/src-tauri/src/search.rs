//! Native-only official YouTube metadata search. Credentials never cross IPC.
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tokio::sync::watch;

const MAX_BYTES: usize = 2 * 1024 * 1024;
const MAX_RESULTS: usize = 12;
const MAX_REQUESTS: usize = 8;
const MAX_CONFIG_BYTES: u64 = 16 * 1024;

#[derive(Debug, Serialize, PartialEq)]
pub struct SearchError {
    code: &'static str,
    message: &'static str,
}
fn error(code: &'static str) -> SearchError {
    SearchError {
        code,
        message: match code {
            "missing_configuration" => "YouTube search has not been configured on this device.",
            "configuration" => "YouTube search configuration needs attention.",
            "invalid_query" => "Enter a song or artist name of up to 200 characters.",
            "cancelled" => "Search cancelled.",
            "busy" => "Search is busy. Please try again.",
            "quota" => "YouTube search is temporarily unavailable. Please try again later.",
            _ => "Search is temporarily unavailable. Please try again.",
        },
    }
}

#[derive(Serialize)]
pub struct SearchStatus {
    pub configured: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRecording {
    id: String,
    provider: &'static str,
    title: String,
    artist: String,
    duration: Option<f64>,
    thumbnail: Option<String>,
    page_url: String,
    audio: Option<()>,
}

#[derive(Default)]
struct Requests {
    active: HashMap<String, watch::Sender<bool>>,
    // Remember cancellation even when its IPC races ahead of search registration.
    cancelled: VecDeque<String>,
}

pub struct SearchService {
    client: reqwest::Client,
    requests: Mutex<Requests>,
}

impl SearchService {
    pub fn new() -> Result<Self, SearchError> {
        let client = reqwest::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|_| error("network"))?;
        Ok(Self {
            client,
            requests: Mutex::new(Requests::default()),
        })
    }

    pub fn status(&self) -> SearchStatus {
        SearchStatus {
            configured: load_key().is_ok(),
        }
    }

    fn register(&self, id: &str) -> Result<watch::Receiver<bool>, SearchError> {
        if id.is_empty()
            || id.len() > 80
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err(error("invalid_query"));
        }
        let mut requests = self.requests.lock().map_err(|_| error("busy"))?;
        if requests.cancelled.iter().any(|previous| previous == id) {
            return Err(error("cancelled"));
        }
        if requests.active.len() >= MAX_REQUESTS || requests.active.contains_key(id) {
            return Err(error("busy"));
        }
        let (sender, receiver) = watch::channel(false);
        requests.active.insert(id.into(), sender);
        Ok(receiver)
    }

    pub fn cancel(&self, id: &str) {
        if id.len() > 80 {
            return;
        }
        if let Ok(mut requests) = self.requests.lock() {
            if let Some(sender) = requests.active.get(id) {
                let _ = sender.send(true);
            }
            if !requests.cancelled.iter().any(|previous| previous == id) {
                requests.cancelled.push_back(id.into());
                if requests.cancelled.len() > 256 {
                    requests.cancelled.pop_front();
                }
            }
        }
    }

    pub fn shutdown(&self) {
        if let Ok(mut requests) = self.requests.lock() {
            for (_, sender) in requests.active.drain() {
                let _ = sender.send(true);
            }
            requests.cancelled.clear();
        }
    }

    pub async fn search(
        &self,
        query: &str,
        id: &str,
    ) -> Result<Vec<CatalogRecording>, SearchError> {
        let query = validate_query(query)?;
        let mut cancellation = self.register(id)?;
        let _registration = Registration { service: self, id };
        let key = load_key()?;
        if *cancellation.borrow() {
            return Err(error("cancelled"));
        }
        tokio::select! {
            biased;
            _ = cancellation.changed() => Err(error("cancelled")),
            result = tokio::time::timeout(Duration::from_secs(20), self.fetch(&query, &key)) => result.map_err(|_| error("network"))?,
        }
    }

    async fn fetch(&self, query: &str, key: &str) -> Result<Vec<CatalogRecording>, SearchError> {
        // These are the only outbound endpoints. No URL, host, or header is supplied by IPC.
        let search = self
            .metadata(
                "https://www.googleapis.com/youtube/v3/search",
                &[
                    ("part", "snippet"),
                    ("type", "video"),
                    ("maxResults", "12"),
                    ("q", query),
                    ("key", key),
                    (
                        "fields",
                        "items(id/videoId,snippet(title,channelTitle,thumbnails/medium/url))",
                    ),
                ],
            )
            .await?;
        let mut recordings = parse_recordings(&search, key)?;
        if recordings.is_empty() {
            return Ok(recordings);
        }
        let ids = recordings
            .iter()
            .map(|r| r.id.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let durations = self
            .metadata(
                "https://www.googleapis.com/youtube/v3/videos",
                &[
                    ("part", "contentDetails"),
                    ("id", &ids),
                    ("key", key),
                    ("fields", "items(id,contentDetails/duration)"),
                ],
            )
            .await?;
        if let Some(items) = durations.get("items").and_then(Value::as_array) {
            for item in items.iter().take(MAX_RESULTS) {
                if let Some(recording) = recordings
                    .iter_mut()
                    .find(|r| Some(r.id.as_str()) == item["id"].as_str())
                {
                    recording.duration = item["contentDetails"]["duration"]
                        .as_str()
                        .and_then(duration_seconds);
                }
            }
        }
        Ok(recordings)
    }

    async fn metadata(
        &self,
        endpoint: &'static str,
        parameters: &[(&str, &str)],
    ) -> Result<Value, SearchError> {
        let mut response = self
            .client
            .get(endpoint)
            .query(parameters)
            .send()
            .await
            .map_err(|_| error("network"))?;
        if !response.status().is_success() {
            // Never echo Google's body or reqwest's errors (which can contain the key URL).
            return Err(error(match response.status().as_u16() {
                400 | 401 => "configuration",
                403 | 429 => "quota",
                _ => "network",
            }));
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_BYTES as u64)
        {
            return Err(error("network"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| error("network"))? {
            append_metadata(&mut bytes, &chunk)?;
        }
        serde_json::from_slice(&bytes).map_err(|_| error("network"))
    }
}

struct Registration<'a> {
    service: &'a SearchService,
    id: &'a str,
}
impl Drop for Registration<'_> {
    fn drop(&mut self) {
        if let Ok(mut requests) = self.service.requests.lock() {
            requests.active.remove(self.id);
        }
    }
}

fn validate_query(query: &str) -> Result<String, SearchError> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 || query.chars().any(char::is_control) {
        return Err(error("invalid_query"));
    }
    Ok(query.into())
}

fn append_metadata(bytes: &mut Vec<u8>, chunk: &[u8]) -> Result<(), SearchError> {
    if bytes.len().saturating_add(chunk.len()) > MAX_BYTES {
        return Err(error("network"));
    }
    bytes.extend_from_slice(chunk);
    Ok(())
}

fn plain(value: &Value, key: &str) -> String {
    let text: String = value
        .as_str()
        .unwrap_or("")
        .chars()
        .take(4096)
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect();
    text.replace(key, "[redacted]")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(512)
        .collect()
}

fn parse_recordings(data: &Value, key: &str) -> Result<Vec<CatalogRecording>, SearchError> {
    let items = data
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| error("network"))?;
    let mut recordings: Vec<CatalogRecording> = Vec::new();
    for item in items.iter().take(MAX_RESULTS) {
        let Some(id) = item["id"]["videoId"].as_str() else {
            continue;
        };
        if id.len() != 11
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            || recordings.iter().any(|r| r.id == id)
        {
            continue;
        }
        let snippet = &item["snippet"];
        let title = plain(&snippet["title"], key);
        if title.is_empty() {
            continue;
        }
        let thumbnail = snippet["thumbnails"]["medium"]["url"]
            .as_str()
            .filter(|url| {
                url.len() <= 2048
                    && !url.contains(key)
                    && reqwest::Url::parse(url).is_ok_and(|parsed| {
                        parsed.scheme() == "https"
                            && parsed.host_str() == Some("i.ytimg.com")
                            && parsed.username().is_empty()
                            && parsed.password().is_none()
                            && parsed.port().is_none()
                            && parsed.query().is_none()
                            && parsed.fragment().is_none()
                    })
            })
            .map(String::from);
        recordings.push(CatalogRecording {
            id: id.into(),
            provider: "youtube",
            title,
            artist: plain(&snippet["channelTitle"], key),
            duration: None,
            thumbnail,
            page_url: format!("https://www.youtube.com/watch?v={id}"),
            audio: None,
        });
    }
    Ok(recordings)
}

fn duration_seconds(value: &str) -> Option<f64> {
    let mut rest = value.strip_prefix('P')?;
    let mut total = 0f64;
    if let Some((days, tail)) = rest.split_once('D') {
        if days.is_empty() || !days.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        total += days.parse::<f64>().ok()? * 86400.;
        rest = tail;
    }
    rest = rest.strip_prefix('T')?;
    let mut previous = 0;
    while !rest.is_empty() {
        let at = rest.find(|c: char| c.is_ascii_alphabetic())?;
        let number = &rest[..at];
        let (rank, factor) = match rest.as_bytes()[at] {
            b'H' => (1, 3600.),
            b'M' => (2, 60.),
            b'S' => (3, 1.),
            _ => return None,
        };
        if rank <= previous
            || number.is_empty()
            || !number
                .bytes()
                .all(|b| b.is_ascii_digit() || (rank == 3 && b == b'.'))
        {
            return None;
        }
        total += number.parse::<f64>().ok()? * factor;
        previous = rank;
        rest = &rest[at + 1..];
    }
    (total.is_finite() && total > 0.).then_some(total)
}

fn valid_key(value: &str) -> Result<String, SearchError> {
    let value = value.trim();
    if !(20..=256).contains(&value.len())
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(error("configuration"));
    }
    Ok(value.into())
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, SearchError> {
    let file = std::fs::File::open(path).map_err(|_| error("configuration"))?;
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("configuration"))?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(error("configuration"));
    }
    Ok(bytes)
}

fn dotenv_key(text: &str) -> Result<Option<String>, SearchError> {
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        if let Some((name, value)) = line.strip_prefix("export ").unwrap_or(line).split_once('=') {
            if name.trim() == "YOUTUBE_API_KEY" {
                let value = value.trim();
                let value = if value.len() >= 2
                    && ((value.starts_with('"') && value.ends_with('"'))
                        || (value.starts_with('\'') && value.ends_with('\'')))
                {
                    &value[1..value.len() - 1]
                } else {
                    value
                };
                return valid_key(value).map(Some);
            }
        }
    }
    Ok(None)
}

fn development_file(cwd: &Path) -> Option<PathBuf> {
    cwd.ancestors()
        .take(5)
        .find(|root| {
            root.join("apps/desktop/src-tauri/Cargo.toml").is_file()
                && root
                    .join("packages/application/catalog-contracts.ts")
                    .is_file()
        })
        .map(|root| root.join(".env.local"))
}

fn load_key() -> Result<String, SearchError> {
    if let Ok(value) = std::env::var("YOUTUBE_API_KEY") {
        return valid_key(&value);
    }
    // Runtime only, debug only: no env! / option_env! / build-script substitution.
    if cfg!(debug_assertions) {
        if let Some(path) = std::env::current_dir()
            .ok()
            .as_deref()
            .and_then(development_file)
            .filter(|path| path.is_file())
        {
            let bytes = read_bounded(&path)?;
            if let Some(key) =
                dotenv_key(std::str::from_utf8(&bytes).map_err(|_| error("configuration"))?)?
            {
                return Ok(key);
            }
        }
    }
    let path = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|root| root.join("Harmonia").join("youtube-api-key.dpapi"));
    if let Some(path) = path.filter(|path| path.is_file()) {
        return unprotect_key(&read_bounded(&path)?);
    }
    Err(error("missing_configuration"))
}

#[cfg(windows)]
fn unprotect_key(bytes: &[u8]) -> Result<String, SearchError> {
    use windows::Win32::{
        Foundation::{LocalFree, HLOCAL},
        Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // DPAPI validates the envelope and binds it to the current Windows user.
    unsafe {
        CryptUnprotectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|_| error("configuration"))?;
        if output.cbData == 0 || output.cbData as u64 > MAX_CONFIG_BYTES {
            let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
            return Err(error("configuration"));
        }
        let clear = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        let key = std::str::from_utf8(clear)
            .map_err(|_| error("configuration"))
            .and_then(valid_key);
        clear.fill(0);
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        key
    }
}

#[cfg(not(windows))]
fn unprotect_key(_: &[u8]) -> Result<String, SearchError> {
    Err(error("configuration"))
}

#[cfg(test)]
mod tests {
    use super::*;
    const KEY: &str = "fake-configuration-key-for-unit-tests";

    #[tokio::test]
    #[ignore = "requires configured real YouTube API; consumes search quota"]
    async fn configured_live_search() {
        let service = SearchService::new().unwrap();
        assert!(
            service.status().configured,
            "native search is not configured"
        );
        let start = std::time::Instant::now();
        let results = service
            .search("Bach cello suite", "native-live-check")
            .await
            .unwrap();
        assert!(!results.is_empty());
        assert!(results.len() <= MAX_RESULTS);
        assert!(results.iter().any(|recording| recording.duration.is_some()));
        assert!(results.iter().all(|recording| recording.audio.is_none()));
        println!("Official API returned {} recordings with duration metadata in {} ms; audio is unavailable.", results.len(), start.elapsed().as_millis());
    }

    #[cfg(windows)]
    #[test]
    fn protected_configuration_roundtrips_and_rejects_corruption() {
        use windows::Win32::{
            Foundation::{LocalFree, HLOCAL},
            Security::Cryptography::{
                CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
        };
        let input = CRYPT_INTEGER_BLOB {
            cbData: KEY.len() as u32,
            pbData: KEY.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        let bytes = unsafe {
            CryptProtectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
            .unwrap();
            let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
            bytes
        };
        assert_eq!(unprotect_key(&bytes).unwrap(), KEY);
        assert_eq!(
            unprotect_key(b"invalid-envelope").unwrap_err().code,
            "configuration"
        );
    }

    #[test]
    fn config_is_exact_bounded_and_errors_are_redacted() {
        assert_eq!(
            dotenv_key(&format!("# comment\nYOUTUBE_API_KEY=\"{KEY}\"\n")).unwrap(),
            Some(KEY.into())
        );
        assert_eq!(dotenv_key("VITE_YOUTUBE_API_KEY=secret").unwrap(), None);
        assert!(dotenv_key("YOUTUBE_API_KEY=\"").is_err());
        let invalid = format!("https://host/?key={KEY}");
        assert!(!serde_json::to_string(&valid_key(&invalid).unwrap_err())
            .unwrap()
            .contains(KEY));
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("config");
        std::fs::write(&path, vec![b'a'; MAX_CONFIG_BYTES as usize + 1]).unwrap();
        assert!(read_bounded(&path).is_err());
    }

    #[test]
    fn query_and_metadata_are_bounded() {
        assert_eq!(validate_query("  guitar  ").unwrap(), "guitar");
        for query in [String::new(), "x".repeat(201), "guitar\0solo".into()] {
            assert!(validate_query(&query).is_err());
        }
        let mut bytes = vec![0; MAX_BYTES - 1];
        append_metadata(&mut bytes, &[1]).unwrap();
        assert!(append_metadata(&mut bytes, &[1]).is_err());
        assert_eq!(bytes.len(), MAX_BYTES);
    }

    #[test]
    fn metadata_has_no_audio_and_rejects_untrusted_ids_and_thumbnails() {
        let item = serde_json::json!({"id":{"videoId":"abcdefghijk"},"snippet":{"title":format!("Song\n{KEY}"),"channelTitle":"Artist", "thumbnails":{"medium":{"url":"https://evil.example/image"}}}});
        let mut items = vec![item; 20];
        items[0]["id"]["videoId"] = "../invalid".into();
        let result = parse_recordings(&serde_json::json!({"items":items}), KEY).unwrap();
        assert_eq!(result.len(), 1);
        assert!(result[0].audio.is_none());
        assert!(result[0].thumbnail.is_none());
        assert!(!serde_json::to_string(&result).unwrap().contains(KEY));
        assert_eq!(
            result[0].page_url,
            "https://www.youtube.com/watch?v=abcdefghijk"
        );
    }

    #[test]
    fn parses_official_durations_without_guessing() {
        assert_eq!(duration_seconds("PT3M12S"), Some(192.));
        assert_eq!(duration_seconds("P1DT2H3M4.5S"), Some(93784.5));
        for value in ["PT0S", "PT", "PT-3S", "PTNaNS", "PT1S1H", "garbage"] {
            assert_eq!(duration_seconds(value), None);
        }
    }

    #[test]
    fn cancellation_is_scoped_race_safe_bounded_and_shutdown_clears_work() {
        let service = SearchService::new().unwrap();
        let first = service.register("first").unwrap();
        let second = service.register("second").unwrap();
        service.cancel("first");
        assert!(*first.borrow());
        assert!(!*second.borrow());
        service.cancel("before-registration");
        assert_eq!(
            service.register("before-registration").unwrap_err().code,
            "cancelled"
        );
        for index in 0..300 {
            service.cancel(&format!("cancel-{index}"));
        }
        assert_eq!(service.requests.lock().unwrap().cancelled.len(), 256);
        for index in 0..MAX_REQUESTS - 2 {
            service.register(&format!("active-{index}")).unwrap();
        }
        assert_eq!(service.register("overflow").unwrap_err().code, "busy");
        service.shutdown();
        assert!(*second.borrow());
        assert!(service.requests.lock().unwrap().active.is_empty());
    }
}
