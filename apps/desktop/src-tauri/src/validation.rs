use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

pub const VALIDATION_PROTOCOL: &str = "HARMONIA_HEADLESS_VALIDATION_V1";
pub const VALIDATION_DIRECTORY_PREFIX: &str = "harmonia-native-smoke-";
pub const VALIDATION_TIMEOUT_SECONDS: u64 = 90;

#[derive(Debug)]
pub struct ValidationOptions {
    pub data_dir: PathBuf,
}

impl ValidationOptions {
    pub fn parse(args: &[OsString], temp_root: &Path) -> Result<Option<Self>, String> {
        let mut headless = false;
        let mut data_dir = None;
        let mut arguments = args.iter();
        while let Some(argument) = arguments.next() {
            if argument == "--validation-headless" {
                if headless {
                    return Err("duplicate validation mode".into());
                }
                headless = true;
            } else if argument == "--validation-data-dir" {
                if data_dir.is_some() {
                    return Err("duplicate validation directory".into());
                }
                data_dir = Some(PathBuf::from(
                    arguments.next().ok_or("validation directory is missing")?,
                ));
            } else if argument.to_string_lossy().starts_with("--validation-") {
                return Err("unknown validation argument".into());
            }
        }
        if !headless {
            return if data_dir.is_some() {
                Err("validation directory requires --validation-headless".into())
            } else {
                Ok(None)
            };
        }
        let requested = data_dir.ok_or("headless validation requires --validation-data-dir")?;
        if !requested.is_absolute() {
            return Err("validation directory must be absolute".into());
        }
        let data_dir = requested
            .canonicalize()
            .map_err(|error| format!("invalid validation directory: {error}"))?;
        let temp_root = temp_root
            .canonicalize()
            .map_err(|error| format!("invalid temporary root: {error}"))?;
        if !data_dir.is_dir()
            || data_dir.parent() != Some(temp_root.as_path())
            || !data_dir.file_name().is_some_and(|name| {
                name.to_string_lossy()
                    .starts_with(VALIDATION_DIRECTORY_PREFIX)
            })
            || std::fs::read_to_string(data_dir.join(".harmonia-validation"))
                .ok()
                .as_deref()
                != Some(VALIDATION_PROTOCOL)
        {
            return Err("validation requires a marked harmonia-native-smoke-* directory directly inside the system temporary directory".into());
        }
        Ok(Some(Self { data_dir }))
    }

    pub fn configure(&self, config: &mut tauri::Config) {
        for window in &mut config.app.windows {
            window.visible = false;
            window.focus = false;
            window.skip_taskbar = true;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn directory() -> tempfile::TempDir {
        let directory = tempfile::Builder::new()
            .prefix(VALIDATION_DIRECTORY_PREFIX)
            .tempdir()
            .unwrap();
        std::fs::write(
            directory.path().join(".harmonia-validation"),
            VALIDATION_PROTOCOL,
        )
        .unwrap();
        directory
    }

    fn args(directory: &Path) -> Vec<OsString> {
        vec![
            "--validation-headless".into(),
            "--validation-data-dir".into(),
            directory.into(),
        ]
    }

    #[test]
    fn normal_startup_does_not_enable_validation() {
        assert!(ValidationOptions::parse(&[], &std::env::temp_dir())
            .unwrap()
            .is_none());
    }

    #[test]
    fn headless_mode_hides_every_window_before_construction() {
        let directory = directory();
        let options = ValidationOptions::parse(&args(directory.path()), &std::env::temp_dir())
            .unwrap()
            .expect("headless mode must be recognized");
        let mut config = tauri::Config::default();
        config.app.windows = vec![Default::default(), Default::default()];
        options.configure(&mut config);
        assert!(config
            .app
            .windows
            .iter()
            .all(|window| !window.visible && !window.focus && window.skip_taskbar));
        assert_eq!(options.data_dir, directory.path().canonicalize().unwrap());
    }

    #[test]
    fn rejects_headless_launch_without_an_isolated_directory() {
        assert!(
            ValidationOptions::parse(&["--validation-headless".into()], &std::env::temp_dir())
                .is_err()
        );
        assert!(
            ValidationOptions::parse(&args(&std::env::temp_dir()), &std::env::temp_dir()).is_err()
        );
    }

    #[test]
    fn rejects_unmarked_directory_and_orphan_validation_arguments() {
        let directory = tempfile::Builder::new()
            .prefix(VALIDATION_DIRECTORY_PREFIX)
            .tempdir()
            .unwrap();
        assert!(ValidationOptions::parse(&args(directory.path()), &std::env::temp_dir()).is_err());
        assert!(ValidationOptions::parse(
            &["--validation-data-dir".into(), directory.path().into()],
            &std::env::temp_dir()
        )
        .is_err());
        assert!(
            ValidationOptions::parse(&["--validation-headles".into()], &std::env::temp_dir())
                .is_err()
        );
    }

    #[test]
    fn rejects_relative_or_outside_temporary_directory_paths() {
        assert!(ValidationOptions::parse(
            &args(Path::new("harmonia-native-smoke-relative")),
            &std::env::temp_dir()
        )
        .is_err());
        let directory = directory();
        let other_root = tempfile::tempdir().unwrap();
        assert!(ValidationOptions::parse(&args(directory.path()), other_root.path()).is_err());
    }
}
