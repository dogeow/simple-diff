use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use crate::path_utils::normalize_relative;
use crate::types::SourceConfig;

struct WatchSession {
  _debouncer: Debouncer<RecommendedWatcher>,
}

pub struct WatchManager {
  sessions: Mutex<HashMap<String, WatchSession>>,
}

impl WatchManager {
  pub fn new() -> Self {
    Self {
      sessions: Mutex::new(HashMap::new()),
    }
  }

  pub fn start(
    &self,
    app: AppHandle,
    session_id: String,
    left: SourceConfig,
    right: SourceConfig,
  ) -> Result<(), String> {
    let left_root = PathBuf::from(left.local_path()?);
    let right_root = PathBuf::from(right.local_path()?);

    self.stop(Some(&session_id));

    let session_id_for_cb = session_id.clone();
    let left_root_cb = left_root.clone();
    let right_root_cb = right_root.clone();

    let mut debouncer = new_debouncer(
      Duration::from_millis(300),
      move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        let mut paths = Vec::new();
        for event in events {
          let path = event.path;
          if let Some(rel) = relative_to_root(&path, &left_root_cb) {
            paths.push(rel);
          } else if let Some(rel) = relative_to_root(&path, &right_root_cb) {
            paths.push(rel);
          }
        }
        if paths.is_empty() {
          return;
        }
        paths.sort();
        paths.dedup();
        let _ = app.emit("compare:local-dirty", (session_id_for_cb.clone(), paths));
      },
    )
    .map_err(|e| format!("启动文件监听失败: {e}"))?;

    if left_root.is_dir() {
      debouncer
        .watcher()
        .watch(&left_root, RecursiveMode::Recursive)
        .map_err(|e| format!("监听左侧目录失败: {e}"))?;
    }
    if right_root.is_dir() && right_root != left_root {
      debouncer
        .watcher()
        .watch(&right_root, RecursiveMode::Recursive)
        .map_err(|e| format!("监听右侧目录失败: {e}"))?;
    }

    self.sessions.lock().insert(
      session_id,
      WatchSession {
        _debouncer: debouncer,
      },
    );
    Ok(())
  }

  pub fn stop(&self, session_id: Option<&str>) {
    let mut sessions = self.sessions.lock();
    if let Some(id) = session_id {
      sessions.remove(id);
    } else {
      sessions.clear();
    }
  }
}

fn relative_to_root(path: &Path, root: &Path) -> Option<String> {
  let path = path.canonicalize().ok()?;
  let root = root.canonicalize().ok()?;
  let rel = path.strip_prefix(&root).ok()?;
  Some(normalize_relative(&rel.to_string_lossy()))
}

pub type SharedWatchManager = Arc<WatchManager>;
