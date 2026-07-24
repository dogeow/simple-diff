use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;
use uuid::Uuid;

use crate::secret_crypto::app_data_dir;
use crate::types::{CompareHistoryEntry, CompareResult, SourceConfig};

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_data_dir(app)?.join("compare-history.json"))
}

fn source_label(app: &AppHandle, source: &SourceConfig) -> String {
  match source {
    SourceConfig::Local { path } => path.clone(),
    SourceConfig::Sftp { config_id, path } => {
      let label = crate::ssh_store::label_for(app, config_id).unwrap_or_else(|| "SFTP".into());
      format!("{label}:{path}")
    }
  }
}

fn read_all(app: &AppHandle) -> Result<Vec<CompareHistoryEntry>, String> {
  let path = history_path(app)?;
  if !path.exists() {
    return Ok(Vec::new());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取历史失败: {e}"))?;
  serde_json::from_str(&raw).map_err(|e| format!("解析历史失败: {e}"))
}

fn write_all(app: &AppHandle, entries: &[CompareHistoryEntry]) -> Result<(), String> {
  let path = history_path(app)?;
  let raw = serde_json::to_string_pretty(entries).map_err(|e| format!("序列化历史失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入历史失败: {e}"))
}

pub fn add_history(
  app: &AppHandle,
  result: &CompareResult,
  left: &SourceConfig,
  right: &SourceConfig,
) -> Result<CompareHistoryEntry, String> {
  let entry = CompareHistoryEntry {
    id: Uuid::new_v4().to_string(),
    timestamp: std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis() as u64)
      .unwrap_or(0),
    left_label: source_label(app, left),
    right_label: source_label(app, right),
    left_source: left.clone(),
    right_source: right.clone(),
    stats: result.stats.clone(),
  };

  let mut history = read_all(app)?;
  history.insert(0, entry.clone());
  history.truncate(50);
  write_all(app, &history)?;
  Ok(entry)
}

pub fn list_history(app: &AppHandle) -> Result<Vec<CompareHistoryEntry>, String> {
  read_all(app)
}

pub fn clear_history(app: &AppHandle) -> Result<(), String> {
  write_all(app, &[])
}

pub fn delete_history(app: &AppHandle, id: &str) -> Result<(), String> {
  let mut history = read_all(app)?;
  history.retain(|entry| entry.id != id);
  write_all(app, &history)
}
