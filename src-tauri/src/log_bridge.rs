use std::fs::{self, OpenOptions};
use std::io::Write;

use tauri::{AppHandle, Emitter};

use crate::secret_crypto::app_data_dir;
use crate::types::{LogEntry, LogLevel, LogScope};

fn valid_entry(entry: &LogEntry) -> bool {
  // All serde variants are accepted; reject empty messages.
  !entry.message.trim().is_empty()
}

fn append_log_file(app: &AppHandle, entry: &LogEntry) {
  let Ok(dir) = app_data_dir(app) else {
    return;
  };
  let log_dir = dir.join("logs");
  if fs::create_dir_all(&log_dir).is_err() {
    return;
  }
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(&log_dir, fs::Permissions::from_mode(0o700));
  }
  let path = log_dir.join("simple-diff.log");
  let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) else {
    return;
  };
  let line = format!(
    "{} {:?} {:?} {}\n",
    entry.timestamp, entry.level, entry.scope, entry.message
  );
  let _ = file.write_all(line.as_bytes());
}

pub fn emit_log(app: &AppHandle, scope: LogScope, level: LogLevel, message: impl Into<String>) {
  let entry = LogEntry {
    timestamp: std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis() as u64)
      .unwrap_or(0),
    level: level.clone(),
    scope,
    message: message.into(),
  };
  write_and_emit(app, entry);
}

pub fn write_and_emit(app: &AppHandle, entry: LogEntry) {
  if !valid_entry(&entry) {
    return;
  }

  match entry.level {
    LogLevel::Info => log::info!("[{:?}] {}", entry.scope, entry.message),
    LogLevel::Warn => log::warn!("[{:?}] {}", entry.scope, entry.message),
    LogLevel::Error => log::error!("[{:?}] {}", entry.scope, entry.message),
  }

  append_log_file(app, &entry);
  let _ = app.emit("app:log", entry);
}
