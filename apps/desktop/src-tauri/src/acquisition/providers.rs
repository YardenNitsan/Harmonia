use super::{cache::MAX_BYTES, health::status_failure, Audio, Failure};
use reqwest::{Client, Url};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, Instant},
};
use tokio::io::AsyncReadExt;

pub fn config(name: &str) -> Option<String> {
    if let Ok(v) = std::env::var(name) {
        if !v.trim().is_empty() {
            return Some(v.trim().into());
        }
    }
    let mut paths = vec![];
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join("Harmonia/acquisition.env"));
    }
    // Developer configuration is native only, never bundled into frontend assets.
    let mut at = std::env::current_dir().ok();
    for _ in 0..5 {
        if let Some(p) = at {
            if p.join("AGENTS.md").exists() && p.join("apps/desktop/src-tauri/Cargo.toml").exists()
            {
                paths.push(p.join(".env.local"));
                break;
            }
            at = p.parent().map(Path::to_path_buf);
        }
    }
    for path in paths {
        if fs::metadata(&path).is_ok_and(|m| m.len() <= 16384) {
            if let Ok(s) = fs::read_to_string(path) {
                for line in s.lines() {
                    let Some((k, v)) = line.trim().split_once('=') else {
                        continue;
                    };
                    if k.trim() == name {
                        let v = v.trim().trim_matches(['\'', '"']);
                        if !v.is_empty() {
                            return Some(v.into());
                        }
                    }
                }
            }
        }
    }
    None
}
pub fn tool_path(name: &str, file: &str) -> Option<PathBuf> {
    config(name)
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("LOCALAPPDATA")
                .map(|p| PathBuf::from(p).join("Harmonia/tools").join(file))
        })
        .filter(|p| p.is_absolute() && p.is_file())
}
pub fn configured(provider: &str) -> bool {
    match provider {
        "yt-dlp" => tool_path("HARMONIA_YTDLP_PATH", "yt-dlp.exe").is_some(),
        "cobalt" => config("COBALT_API_URL")
            .and_then(|u| cobalt_endpoint(&u).ok())
            .is_some(),
        "saveapi" => config("SAVEAPI_API_KEY").is_some(),
        _ => false,
    }
}
pub fn cobalt_endpoint(value: &str) -> Result<Url, Failure> {
    let url = Url::parse(value).map_err(|_| Failure::Misconfigured)?;
    let host = url.host_str().ok_or(Failure::Misconfigured)?;
    if host == "cobalt.tools"
        || host.ends_with(".cobalt.tools")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.scheme() == "https"
            || (url.scheme() == "http" && matches!(host, "localhost" | "127.0.0.1" | "[::1]")))
    {
        return Err(Failure::Misconfigured);
    }
    Ok(url)
}
fn public_https(url: &Url) -> bool {
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return false;
    }
    if let Ok(ip) = host.trim_matches(['[', ']']).parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(a) => {
                !(a.is_private()
                    || a.is_loopback()
                    || a.is_link_local()
                    || a.is_unspecified()
                    || a.is_multicast()
                    || a.is_broadcast())
            }
            std::net::IpAddr::V6(a) => {
                !(a.is_loopback()
                    || a.is_unspecified()
                    || a.is_multicast()
                    || (a.segments()[0] & 0xfe00) == 0xfc00
                    || (a.segments()[0] & 0xffc0) == 0xfe80)
            }
        };
    }
    true
}
fn media_url(value: &str, own: Option<&Url>) -> Result<Url, Failure> {
    let url = Url::parse(value).map_err(|_| Failure::Corrupt)?;
    if (public_https(&url)
        && url.host_str().is_some_and(|h| {
            h == "googlevideo.com" || h.ends_with(".googlevideo.com") || h == "api.saveapi.org"
        }))
        || own.is_some_and(|o| {
            o.origin() == url.origin() && url.username().is_empty() && url.password().is_none()
        })
    {
        Ok(url)
    } else {
        Err(Failure::Corrupt)
    }
}
pub fn client() -> Result<Client, Failure> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| Failure::Transient)
}
async fn body(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>, Failure> {
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err(Failure::Corrupt);
    }
    let mut bytes = vec![];
    while let Some(chunk) = response.chunk().await.map_err(|_| Failure::Network)? {
        if bytes.len() + chunk.len() > limit {
            return Err(Failure::Corrupt);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
async fn json_response(response: reqwest::Response) -> Result<Value, Failure> {
    let status = response.status().as_u16();
    let retry = response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());
    let bytes = body(response, 1024 * 1024).await?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| {
        if status >= 400 {
            status_failure(status, retry, "")
        } else {
            Failure::Corrupt
        }
    })?;
    if status >= 400 {
        return Err(status_failure(
            status,
            retry,
            value
                .pointer("/error/code")
                .and_then(Value::as_str)
                .unwrap_or(""),
        ));
    }
    if value.get("success") == Some(&Value::Bool(false)) {
        return Err(Failure::Unsupported);
    }
    Ok(value)
}
async fn download(
    client: &Client,
    url: &str,
    own: Option<&Url>,
    path: &Path,
) -> Result<(), Failure> {
    let mut url = media_url(url, own)?;
    let mut response = None;
    for _ in 0..4 {
        let r = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| Failure::Network)?;
        if r.status().is_redirection() {
            let next = r
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or(Failure::Corrupt)?;
            url = media_url(url.join(next).map_err(|_| Failure::Corrupt)?.as_str(), own)?;
        } else {
            response = Some(r);
            break;
        }
    }
    let mut response = response.ok_or(Failure::Corrupt)?;
    if !response.status().is_success() {
        // A signed-media access denial is not an API credential failure.
        if matches!(response.status().as_u16(), 401 | 403) {
            return Err(Failure::Unsupported);
        }
        return Err(status_failure(
            response.status().as_u16(),
            response
                .headers()
                .get("retry-after")
                .and_then(|s| s.to_str().ok())
                .and_then(|s| s.parse().ok()),
            "",
        ));
    }
    if response.content_length().is_some_and(|n| n > MAX_BYTES) {
        return Err(Failure::Corrupt);
    }
    if response
        .headers()
        .get("content-type")
        .and_then(|s| s.to_str().ok())
        .is_some_and(|s| s.contains("text/") || s.contains("application/json"))
    {
        return Err(Failure::Corrupt);
    }
    let mut file = fs::File::create(path).map_err(|_| Failure::Transient)?;
    let mut total = 0;
    use std::io::Write;
    while let Some(chunk) = response.chunk().await.map_err(|_| Failure::Network)? {
        total += chunk.len() as u64;
        if total > MAX_BYTES {
            return Err(Failure::Corrupt);
        }
        file.write_all(&chunk).map_err(|_| Failure::Transient)?;
    }
    if total < 16 {
        return Err(Failure::Corrupt);
    }
    Ok(())
}
fn duration(value: &Value) -> Result<Option<f64>, Failure> {
    let d = value
        .get("duration_seconds")
        .or_else(|| value.get("duration"))
        .and_then(Value::as_f64);
    if d.is_some_and(|v| !v.is_finite() || v <= 0.0 || v > 1200.0) {
        Err(Failure::Unsupported)
    } else {
        Ok(d)
    }
}
fn title(value: &Value) -> String {
    value
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Selected song")
        .chars()
        .filter(|c| !c.is_control())
        .take(300)
        .collect()
}
fn verify_identity(value: &Value, video: &str) -> Result<(), Failure> {
    if value
        .get("video_id")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .is_some_and(|id| id != video)
    {
        return Err(Failure::Corrupt);
    }
    Ok(())
}
fn saveapi_format(info: &Value) -> Result<&'static str, Failure> {
    let formats = info
        .get("audio_formats")
        .or_else(|| info.get("formats"))
        .and_then(Value::as_array)
        .ok_or(Failure::Corrupt)?;
    let format = ["m4a", "mp3"]
        .into_iter()
        .find(|quality| {
            formats.iter().any(|f| {
                f.get("quality")
                    .or_else(|| f.get("format"))
                    .and_then(Value::as_str)
                    == Some(quality)
                    && f.get("file_size")
                        .and_then(Value::as_u64)
                        .is_none_or(|n| n <= MAX_BYTES)
            })
        })
        .ok_or(Failure::Unsupported)?;
    Ok(format)
}
pub async fn acquire(
    provider: &str,
    video: &str,
    dir: &Path,
    client: &Client,
) -> Result<(PathBuf, Audio), Failure> {
    let started = Instant::now();
    let url = format!("https://www.youtube.com/watch?v={video}");
    let (path, mut audio) = match provider {
        "yt-dlp" => ytdlp(video, dir).await?,
        "cobalt" => {
            let endpoint =
                cobalt_endpoint(&config("COBALT_API_URL").ok_or(Failure::Misconfigured)?)?;
            let mut request=client.post(endpoint.clone()).header("Accept","application/json").json(&json!({"url":url,"downloadMode":"audio","audioFormat":"best","localProcessing":"disabled"}));
            if let Some(key) = config("COBALT_API_KEY") {
                request = request.header("Authorization", format!("Api-Key {key}"));
            }
            let value = json_response(request.send().await.map_err(|_| Failure::Network)?).await?;
            if !matches!(
                value.get("status").and_then(Value::as_str),
                Some("tunnel" | "redirect")
            ) {
                return Err(Failure::Unsupported);
            }
            let link = value
                .get("url")
                .and_then(Value::as_str)
                .ok_or(Failure::Corrupt)?;
            let path = dir.join("audio.download");
            download(client, link, Some(&endpoint), &path).await?;
            (path, Audio::new(provider, video, "Selected song", None, 0))
        }
        "saveapi" => {
            let key = config("SAVEAPI_API_KEY").ok_or(Failure::Misconfigured)?;
            let info = json_response(
                client
                    .get("https://api.saveapi.org/v1/youtube/info")
                    .bearer_auth(&key)
                    .query(&[("url", url.as_str())])
                    .send()
                    .await
                    .map_err(|_| Failure::Network)?,
            )
            .await?;
            verify_identity(&info, video)?;
            duration(&info)?;
            let format = saveapi_format(&info)?;
            let value = json_response(
                client
                    .get("https://api.saveapi.org/v1/youtube/create")
                    .bearer_auth(&key)
                    .query(&[("url", url.as_str()), ("quality", format)])
                    .send()
                    .await
                    .map_err(|_| Failure::Network)?,
            )
            .await?;
            verify_identity(&value, video)?;
            let duration = duration(&value)?;
            if value
                .get("file_size")
                .and_then(Value::as_u64)
                .is_some_and(|n| n > MAX_BYTES)
            {
                return Err(Failure::Unsupported);
            }
            let link = value
                .get("url")
                .and_then(Value::as_str)
                .ok_or(Failure::Corrupt)?;
            let path = dir.join("audio.download");
            download(client, link, None, &path).await?;
            (
                path,
                Audio::new(provider, video, &title(&value), duration, 0),
            )
        }
        _ => return Err(Failure::Misconfigured),
    };
    audio.acquisition_ms = started.elapsed().as_millis() as u64;
    Ok((path, audio))
}

struct OwnedChild {
    child: tokio::process::Child,
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if let Some(pid) = self.child.id() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("taskkill.exe")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            let _ = self.child.start_kill();
        }
    }
}
async fn ytdlp(video: &str, dir: &Path) -> Result<(PathBuf, Audio), Failure> {
    let exe = tool_path("HARMONIA_YTDLP_PATH", "yt-dlp.exe").ok_or(Failure::Misconfigured)?;
    let mut command = tokio::process::Command::new(exe);
    command
        .args([
            "--ignore-config",
            "--no-plugin-dirs",
            "--no-cache-dir",
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "--no-simulate",
            "--socket-timeout",
            "12",
            "--retries",
            "1",
            "--fragment-retries",
            "1",
            "--concurrent-fragments",
            "1",
            "--max-filesize",
            "100M",
            "--match-filter",
            "duration <= 1200 & !is_live & !is_upcoming",
            "--format",
            "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
            "--print",
        "after_move:{\"id\":%(id)j,\"title\":%(title)j,\"duration\":%(duration)j,\"ext\":%(ext)j}",
            "--output",
        ])
        .arg(dir.join("audio.%(ext)s"));
    if let Some(deno) = tool_path("HARMONIA_JS_RUNTIME_PATH", "deno.exe") {
        command
            .arg("--js-runtimes")
            .arg(format!("deno:{}", deno.display()));
    }
    command
        .arg("--")
        .arg(format!("https://www.youtube.com/watch?v={video}"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut guard = OwnedChild {
        child: command.spawn().map_err(|_| Failure::Misconfigured)?,
    };
    let stdout = guard.child.stdout.take().ok_or(Failure::Transient)?;
    let stderr = guard.child.stderr.take().ok_or(Failure::Transient)?;
    let output = async move {
        let mut out = vec![];
        let mut err = vec![];
        let mut stdout = stdout.take(65537);
        let mut stderr = stderr.take(65537);
        let (a, b) = tokio::join!(stdout.read_to_end(&mut out), stderr.read_to_end(&mut err));
        a.map_err(|_| Failure::Transient)?;
        b.map_err(|_| Failure::Transient)?;
        if out.len() > 65536 || err.len() > 65536 {
            return Err(Failure::Corrupt);
        }
        Ok::<_, Failure>((out, err))
    };
    let monitor = async {
        loop {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let size: u64 = fs::read_dir(dir)
                .map_err(|_| Failure::Transient)?
                .flatten()
                .filter_map(|e| e.metadata().ok())
                .map(|m| m.len())
                .sum();
            if size > MAX_BYTES + 1024 * 1024 {
                return Err::<(), Failure>(Failure::Corrupt);
            }
        }
    };
    let (stdout, stderr) = tokio::select! {result=output=>result?, result=monitor=>{result?;return Err(Failure::Corrupt)}};
    let status = guard.child.wait().await.map_err(|_| Failure::Network)?;
    if !status.success() {
        let message = String::from_utf8_lossy(&stderr).to_lowercase();
        return Err(if message.contains("429") {
            Failure::RateLimited(60)
        } else if message.contains("sign in")
            || message.contains("drm")
            || message.contains("private")
            || message.contains("not available")
            || message.contains("unsupported")
            || message.contains("video unavailable")
            || message.contains("video is unavailable")
        {
            Failure::Unsupported
        } else {
            Failure::Network
        });
    }
    let metadata = String::from_utf8_lossy(&stdout);
    let value = metadata
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Value>(line).ok())
        .ok_or(Failure::Unsupported)?;
    let duration = duration(&value)?;
    verify_identity(&value, video)?;
    let extension = value
        .get("ext")
        .and_then(Value::as_str)
        .ok_or(Failure::Corrupt)?;
    if !["webm", "m4a", "mp3", "ogg", "opus", "wav", "aac"].contains(&extension) {
        return Err(Failure::Unsupported);
    }
    let path = dir.join(format!("audio.{extension}"));
    if !path.is_file() {
        return Err(Failure::Corrupt);
    }
    Ok((
        path,
        Audio::new("yt-dlp", video, &title(&value), duration, 0),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[tokio::test]
    async fn dropping_owned_child_terminates_hidden_process_tree() {
        use windows::Win32::{
            Foundation::CloseHandle,
            System::Threading::{
                GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            },
        };
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("fixture.ps1");
        let pid_file = dir.path().join("child.pid");
        fs::write(&script,"$child = Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 30' -WindowStyle Hidden -PassThru\n[IO.File]::WriteAllText($args[0], [string]$child.Id)\nStart-Sleep -Seconds 30").unwrap();
        let mut command = tokio::process::Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .arg(&pid_file)
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let guard = OwnedChild {
            child: command.spawn().unwrap(),
        };
        for _ in 0..80 {
            if pid_file.is_file() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let pid = fs::read_to_string(pid_file)
            .unwrap()
            .parse::<u32>()
            .unwrap();
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).unwrap() };
        drop(guard);
        let mut exit_code = 259;
        for _ in 0..20 {
            unsafe {
                GetExitCodeProcess(handle, &mut exit_code).unwrap();
            }
            if exit_code != 259 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        unsafe {
            CloseHandle(handle).unwrap();
        }
        assert_ne!(
            exit_code, 259,
            "cancelled acquisition must not leave its child alive"
        );
    }
    fn http_fixture(
        status: &str,
        headers: &str,
        body: &str,
    ) -> (String, std::thread::JoinHandle<()>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}",
            body.len()
        );
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            stream.write_all(response.as_bytes()).unwrap();
        });
        (url, handle)
    }
    #[tokio::test]
    async fn actual_http_errors_classify_auth_throttle_invalid_and_server_retry() {
        for (status, headers, body, expected) in [
            (
                "401 Unauthorized",
                "Content-Type: application/json\r\n",
                "{\"error\":{\"code\":\"INVALID_API_KEY\"}}",
                Failure::Misconfigured,
            ),
            (
                "429 Too Many Requests",
                "Retry-After: 120\r\nContent-Type: application/json\r\n",
                "{}",
                Failure::RateLimited(120),
            ),
            (
                "400 Bad Request",
                "Content-Type: application/json\r\n",
                "{\"error\":{\"code\":\"INVALID_URL\"}}",
                Failure::Invalid,
            ),
            (
                "503 Service Unavailable",
                "Content-Type: text/html\r\n",
                "unavailable",
                Failure::Transient,
            ),
        ] {
            let (url, server) = http_fixture(status, headers, body);
            let response = client().unwrap().get(url).send().await.unwrap();
            assert_eq!(json_response(response).await.unwrap_err(), expected);
            server.join().unwrap();
        }
    }
    #[tokio::test]
    async fn actual_download_rejects_success_html_empty_and_denied_media_without_disabling_credentials(
    ) {
        for (status, headers, body, expected) in [
            (
                "200 OK",
                "Content-Type: text/html\r\n",
                "<html>This is not a song</html>",
                Failure::Corrupt,
            ),
            (
                "200 OK",
                "Content-Type: audio/mp4\r\n",
                "",
                Failure::Corrupt,
            ),
            (
                "403 Forbidden",
                "Content-Type: text/plain\r\n",
                "expired media",
                Failure::Unsupported,
            ),
        ] {
            let (url, server) = http_fixture(status, headers, body);
            let own = Url::parse(&url).unwrap();
            let dir = tempfile::tempdir().unwrap();
            assert_eq!(
                download(
                    &client().unwrap(),
                    &url,
                    Some(&own),
                    &dir.path().join("audio")
                )
                .await
                .unwrap_err(),
                expected
            );
            server.join().unwrap();
        }
    }
    #[test]
    fn mismatched_provider_video_identity_is_rejected() {
        assert_eq!(
            verify_identity(&json!({"video_id":"wrongrecord"}), "abcdefghijk"),
            Err(Failure::Corrupt)
        );
        assert!(verify_identity(&json!({"id":"abcdefghijk"}), "abcdefghijk").is_ok());
    }
    #[test]
    fn saveapi_prefers_native_audio_formats_from_official_info_schema() {
        let info = json!({"formats":[{"quality":"720p","file_size":40000}],"audio_formats":[{"quality":"mp3","file_size":9000},{"quality":"m4a","file_size":8000}]});
        assert_eq!(saveapi_format(&info), Ok("m4a"));
        assert_eq!(
            saveapi_format(
                &json!({"audio_formats":[{"quality":"m4a","file_size":MAX_BYTES+1},{"quality":"mp3","file_size":5000}]})
            ),
            Ok("mp3")
        );
    }
    #[test]
    fn rejects_public_cobalt_and_private_download_redirects() {
        assert!(cobalt_endpoint("https://api.cobalt.tools/").is_err());
        let own = cobalt_endpoint("http://127.0.0.1:9000/").unwrap();
        assert!(media_url("http://127.0.0.1:9000/tunnel?id=x", Some(&own)).is_ok());
        assert!(media_url("http://127.0.0.1:8000/secret", Some(&own)).is_err());
        assert!(media_url("https://169.254.169.254/latest", None).is_err());
        assert!(media_url("file:///etc/passwd", None).is_err());
        assert!(media_url("https://rr1.googlevideo.com/audio", None).is_ok());
    }
    #[test]
    fn duration_limits() {
        assert_eq!(duration(&json!({})).unwrap(), None);
        assert!(duration(&json!({"duration":1201})).is_err());
    }
}
