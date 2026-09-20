use super::{Audio, Failure};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const MAX_BYTES: u64 = 100 * 1024 * 1024;
pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn hash_file(path: &Path) -> Result<String, Failure> {
    let mut f = fs::File::open(path).map_err(|_| Failure::Corrupt)?;
    let mut hash = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).map_err(|_| Failure::Corrupt)?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub fn token_valid(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
pub fn media_type(bytes: &[u8]) -> Result<(&'static str, &'static str), Failure> {
    if bytes.len() < 16 {
        return Err(Failure::Corrupt);
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
        Ok(("wav", "audio/wav"))
    } else if bytes.starts_with(b"OggS") {
        Ok(("ogg", "audio/ogg"))
    } else if bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        Ok(("webm", "audio/webm"))
    } else if bytes.get(4..8) == Some(b"ftyp") {
        Ok(("m4a", "audio/mp4"))
    } else if bytes[0] == 0xff && bytes[1] & 0xf6 == 0xf0 {
        Ok(("aac", "audio/aac"))
    } else if bytes.starts_with(b"ID3") || (bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0) {
        Ok(("mp3", "audio/mpeg"))
    } else {
        Err(Failure::Corrupt)
    }
}
fn read_metadata(path: &Path) -> Option<Audio> {
    let mut bytes = vec![];
    fs::File::open(path)
        .ok()?
        .take(16385)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 16384 {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}
#[derive(Clone)]
pub struct Cache {
    root: PathBuf,
    leases: Arc<Mutex<HashMap<String, Instant>>>,
}
impl Cache {
    pub fn new(root: PathBuf) -> Result<Self, Failure> {
        fs::create_dir_all(&root).map_err(|_| Failure::Transient)?;
        let cache = Self {
            root: root.canonicalize().map_err(|_| Failure::Transient)?,
            leases: Arc::new(Mutex::new(HashMap::new())),
        };
        cache.remove_stale_jobs();
        Ok(cache)
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    fn lease(&self, token: &str) {
        if let Ok(mut leases) = self.leases.lock() {
            leases.retain(|_, time| time.elapsed() < Duration::from_secs(60));
            if leases.len() >= 8 && !leases.contains_key(token) {
                if let Some(oldest) = leases
                    .iter()
                    .min_by_key(|(_, time)| **time)
                    .map(|(token, _)| token.clone())
                {
                    leases.remove(&oldest);
                }
            }
            leases.insert(token.into(), Instant::now());
        }
    }
    fn leased(&self, token: &str) -> bool {
        self.leases.lock().is_ok_and(|leases| {
            leases
                .get(token)
                .is_some_and(|time| time.elapsed() < Duration::from_secs(60))
        })
    }
    // Only expired, directly owned job directories are traversed. Never follow a
    // symlink/junction or remove arbitrary directories from the cache root.
    fn remove_stale_jobs(&self) {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if !name.starts_with("job-")
                || name.len() != 10
                || !name[4..].bytes().all(|b| b.is_ascii_alphanumeric())
            {
                continue;
            }
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            if !meta.is_dir()
                || meta.file_type().is_symlink()
                || meta
                    .modified()
                    .ok()
                    .and_then(|m| m.elapsed().ok())
                    .is_none_or(|age| age.as_secs() < 3600)
            {
                continue;
            }
            let Ok(resolved) = path.canonicalize() else {
                continue;
            };
            if resolved.parent() != Some(self.root.as_path()) {
                continue;
            }
            let Ok(children) = fs::read_dir(&resolved) else {
                continue;
            };
            let children: Vec<_> = children.flatten().collect();
            if children
                .iter()
                .any(|c| c.file_type().is_ok_and(|t| !t.is_file() || t.is_symlink()))
            {
                continue;
            }
            for child in children {
                let _ = fs::remove_file(child.path());
            }
            let _ = fs::remove_dir(resolved);
        }
    }
    fn path(&self, token: &str, ext: &str) -> Result<PathBuf, Failure> {
        if !token_valid(token) {
            return Err(Failure::Invalid);
        }
        let path = self.root.join(format!("{token}.{ext}"));
        if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(Failure::Corrupt);
        }
        Ok(path)
    }
    pub fn get(&self, video: &str, exclude: &[String]) -> Option<Audio> {
        let mut found = vec![];
        for entry in fs::read_dir(&self.root).ok()?.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json")
                || entry.file_type().ok()?.is_symlink()
            {
                continue;
            }
            let token = path.file_stem()?.to_str()?;
            if !token_valid(token) {
                continue;
            }
            let metadata = entry.metadata().ok()?;
            if metadata.len() > 16384 {
                continue;
            }
            let mut a: Audio = match fs::read(&path)
                .ok()
                .and_then(|v| serde_json::from_slice(&v).ok())
            {
                Some(v) => v,
                None => continue,
            };
            if a.byte_length > MAX_BYTES
                || !super::ORDER.contains(&a.provider.as_str())
                || a.video_id != video
                || exclude.contains(&a.provider)
                || a.cache_token != token
                || now().saturating_sub(a.last_access) > 30 * 86400
            {
                continue;
            }
            let media = self.path(token, "audio").ok()?;
            if !media.is_file()
                || fs::metadata(&media).ok()?.len() != a.byte_length
                || hash_file(&media).ok()? != a.fingerprint
            {
                continue;
            }
            a.cached = true;
            a.acquisition_ms = 0;
            found.push(a);
        }
        found.sort_by_key(|a| std::cmp::Reverse(a.last_access));
        let mut a = found.into_iter().next()?;
        a.last_access = now();
        self.lease(&a.cache_token);
        let _ = fs::write(
            self.path(&a.cache_token, "json").ok()?,
            serde_json::to_vec(&a).ok()?,
        );
        Some(a)
    }
    pub fn publish(&self, path: &Path, mut audio: Audio) -> Result<Audio, Failure> {
        let length = fs::metadata(path).map_err(|_| Failure::Corrupt)?.len();
        if !(16..=MAX_BYTES).contains(&length) {
            return Err(Failure::Corrupt);
        }
        let mut head = [0u8; 64];
        let n = fs::File::open(path)
            .and_then(|mut f| f.read(&mut head))
            .map_err(|_| Failure::Corrupt)?;
        let (container, mime) = media_type(&head[..n])?;
        audio.fingerprint = hash_file(path)?;
        audio.byte_length = length;
        audio.container = container.into();
        audio.mime = mime.into();
        audio.last_access = now();
        audio.cache_token = format!(
            "{:x}",
            Sha256::digest(
                format!(
                    "{}:{}:{}",
                    audio.video_id, audio.provider, audio.fingerprint
                )
                .as_bytes()
            )
        );
        let destination = self.path(&audio.cache_token, "audio")?;
        if destination.exists()
            && hash_file(&destination).ok().as_deref() != Some(&audio.fingerprint)
        {
            fs::remove_file(&destination).map_err(|_| Failure::Network)?;
        }
        if !destination.exists() {
            fs::rename(path, &destination).map_err(|_| Failure::Transient)?;
        }
        let metadata = self.path(&audio.cache_token, "json")?;
        let temp = self.path(&audio.cache_token, "pending")?;
        fs::write(
            &temp,
            serde_json::to_vec(&audio).map_err(|_| Failure::Corrupt)?,
        )
        .map_err(|_| Failure::Transient)?;
        if metadata.exists() {
            fs::remove_file(&metadata).map_err(|_| Failure::Transient)?;
        }
        fs::rename(temp, metadata).map_err(|_| Failure::Transient)?;
        self.lease(&audio.cache_token);
        self.cleanup(Some(&audio.cache_token));
        Ok(audio)
    }
    pub fn read(&self, token: &str, offset: u64, length: usize) -> Result<Vec<u8>, Failure> {
        if length == 0 || length > 1024 * 1024 {
            return Err(Failure::Invalid);
        }
        let mut f = fs::File::open(self.path(token, "audio")?).map_err(|_| Failure::Corrupt)?;
        let size = f.metadata().map_err(|_| Failure::Corrupt)?.len();
        if size > MAX_BYTES || offset > size {
            return Err(Failure::Invalid);
        }
        self.lease(token);
        f.seek(SeekFrom::Start(offset))
            .map_err(|_| Failure::Corrupt)?;
        let mut bytes = vec![0; length.min((size - offset) as usize)];
        f.read_exact(&mut bytes).map_err(|_| Failure::Corrupt)?;
        Ok(bytes)
    }
    pub fn reject(&self, token: &str) -> Result<Option<String>, Failure> {
        if let Ok(mut leases) = self.leases.lock() {
            leases.remove(token);
        }
        let meta = self.path(token, "json")?;
        let provider = read_metadata(&meta).map(|a| a.provider);
        let _ = fs::remove_file(meta);
        let _ = fs::remove_file(self.path(token, "audio")?);
        Ok(provider)
    }
    pub fn cleanup(&self, keep: Option<&str>) {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return;
        };
        let mut records = vec![];
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(token) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if !token_valid(token) || entry.file_type().is_ok_and(|t| t.is_symlink()) {
                continue;
            }
            let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
                continue;
            };
            if ext == "audio" {
                let meta = self.root.join(format!("{token}.json"));
                if !meta.exists() {
                    let _ = fs::remove_file(path);
                }
                continue;
            }
            if ext != "json" {
                continue;
            }
            let record = read_metadata(&path);
            match record {
                Some(a) => records.push(a),
                None => {
                    let _ = self.reject(token);
                }
            }
        }
        records.sort_by_key(|a| a.last_access);
        let mut bytes: u64 = records
            .iter()
            .fold(0u64, |n, a| n.saturating_add(a.byte_length));
        let mut count = records.len();
        for a in records {
            if keep == Some(&a.cache_token) || self.leased(&a.cache_token) {
                continue;
            }
            if count > 20
                || bytes > 1024 * 1024 * 1024
                || now().saturating_sub(a.last_access) > 30 * 86400
            {
                let _ = self.reject(&a.cache_token);
                bytes = bytes.saturating_sub(a.byte_length);
                count -= 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn corrupt_html_and_path_escape_rejected() {
        assert_eq!(media_type(b"<html>not audio</html>"), Err(Failure::Corrupt));
        assert!(!token_valid("../../private"));
        let dir = tempfile::tempdir().unwrap();
        let cache = Cache::new(dir.path().to_owned()).unwrap();
        assert!(cache.read("../secret", 0, 16).is_err());
        assert!(cache.read(&"a".repeat(64), 0, 2 * 1024 * 1024).is_err());
    }
    #[test]
    fn content_cache_retains_exact_bytes_and_removes_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let cache = Cache::new(dir.path().to_owned()).unwrap();
        let path = dir.path().join("input");
        let bytes = b"RIFF0123WAVE0123456789";
        fs::write(&path, bytes).unwrap();
        let a = cache
            .publish(
                &path,
                Audio::new("yt-dlp", "abcdefghijk", "Song", Some(3.0), 10),
            )
            .unwrap();
        assert_eq!(cache.read(&a.cache_token, 0, 1024).unwrap(), bytes);
        let cached = cache.get("abcdefghijk", &[]).unwrap();
        assert!(cached.cached);
        assert_eq!(cached.fingerprint, a.fingerprint);
        assert!(cache.get("abcdefghijk", &["yt-dlp".into()]).is_none());
        fs::write(
            cache.path(&a.cache_token, "audio").unwrap(),
            b"corrupt previously cached bytes",
        )
        .unwrap();
        assert!(cache.get("abcdefghijk", &[]).is_none());
        fs::write(&path, bytes).unwrap();
        let repaired = cache
            .publish(
                &path,
                Audio::new("yt-dlp", "abcdefghijk", "Song", Some(3.0), 10),
            )
            .unwrap();
        assert_eq!(repaired.fingerprint, a.fingerprint);
        assert_eq!(cache.read(&a.cache_token, 0, 1024).unwrap(), bytes);
        assert_eq!(
            cache.reject(&a.cache_token).unwrap().as_deref(),
            Some("yt-dlp")
        );
        assert!(cache.get("abcdefghijk", &[]).is_none());
    }
    #[test]
    fn cleanup_bounded_and_preserves_unowned_files() {
        let dir = tempfile::tempdir().unwrap();
        let cache = Cache::new(dir.path().to_owned()).unwrap();
        fs::write(dir.path().join("personal.txt"), b"preserve").unwrap();
        for i in 0..22 {
            let path = dir.path().join("input");
            fs::write(&path, format!("RIFF0123WAVE0123456789{i}")).unwrap();
            cache
                .publish(
                    &path,
                    Audio::new("yt-dlp", &format!("abcdefgh{i:03}"), "Song", Some(3.0), 10),
                )
                .unwrap();
        }
        let count = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
            .count();
        assert_eq!(count, 20);
        assert!(dir.path().join("personal.txt").exists());
    }
}
