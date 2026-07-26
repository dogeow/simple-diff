use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::log_bridge;
use crate::path_utils::normalize_relative_safe;
use crate::secret_crypto::app_data_dir;
use crate::source_ops::{copy_between, SourceSession};
use crate::sync_plan::{expand_directory_entries, seed_sync_queues};
use crate::types::{
  LogLevel, LogScope, SourceConfig, StartSyncRequest, SyncDirection, SyncItem, SyncItemKind,
  SyncTaskItemSnapshot, SyncTaskItemStatus, SyncTaskSnapshot, SyncTaskStatus,
};

const PROGRESS_NOTIFY_MS: u128 = 250;
const PERSIST_INTERVAL_MS: u128 = 5000;

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn assert_safe_relative(path: &str) -> Result<String, String> {
  normalize_relative_safe(path).map_err(|_| "同步项路径包含非法路径片段".into())
}

fn source_pair(
  direction: &SyncDirection,
  left: &SourceConfig,
  right: &SourceConfig,
) -> (SourceConfig, SourceConfig) {
  match direction {
    SyncDirection::LeftToRight => (left.clone(), right.clone()),
    SyncDirection::RightToLeft => (right.clone(), left.clone()),
  }
}

fn sources_same(a: &SourceConfig, b: &SourceConfig) -> bool {
  match (a, b) {
    (SourceConfig::Local { path: x }, SourceConfig::Local { path: y }) => x == y,
    (
      SourceConfig::Sftp {
        config_id: cx,
        path: px,
      },
      SourceConfig::Sftp {
        config_id: cy,
        path: py,
      },
    ) => cx == cy && px == py,
    _ => false,
  }
}

fn item_key(item: &SyncItem) -> String {
  format!("{:?}:{}", item.kind, item.relative_path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSyncTask {
  snapshot: SyncTaskSnapshot,
  pending_items: Vec<SyncItem>,
  all_items: Vec<SyncItem>,
}

fn persist_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_data_dir(app)?.join("sync-task.json"))
}

fn load_persisted(app: &AppHandle) -> Option<PersistedSyncTask> {
  let path = persist_path(app).ok()?;
  if !path.exists() {
    return None;
  }
  let raw = fs::read_to_string(path).ok()?;
  serde_json::from_str(&raw).ok()
}

fn save_persisted(app: &AppHandle, task: Option<&PersistedSyncTask>) {
  let Ok(path) = persist_path(app) else {
    return;
  };
  match task {
    None => {
      let _ = fs::remove_file(path);
    }
    Some(task) => {
      if let Ok(raw) = serde_json::to_string_pretty(task) {
        let _ = fs::write(&path, raw);
        #[cfg(unix)]
        {
          use std::os::unix::fs::PermissionsExt;
          let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
      }
    }
  }
}

struct InnerTask {
  snapshot: SyncTaskSnapshot,
  pending: VecDeque<SyncItem>,
  all_items: Vec<SyncItem>,
  completed_keys: HashSet<String>,
}

impl InnerTask {
  fn to_persisted(&self) -> PersistedSyncTask {
    PersistedSyncTask {
      snapshot: {
        let mut snap = self.snapshot.clone();
        snap.items = None;
        snap
      },
      pending_items: self.pending.iter().cloned().collect(),
      all_items: self.all_items.clone(),
    }
  }
}

pub struct SyncManager {
  inner: Mutex<Option<InnerTask>>,
  loop_running: Mutex<bool>,
  last_notify: Mutex<Instant>,
  last_persist: Mutex<Instant>,
  dirty: Mutex<bool>,
}

impl SyncManager {
  pub fn new() -> Self {
    Self {
      inner: Mutex::new(None),
      loop_running: Mutex::new(false),
      last_notify: Mutex::new(Instant::now() - std::time::Duration::from_secs(1)),
      last_persist: Mutex::new(Instant::now() - std::time::Duration::from_secs(10)),
      dirty: Mutex::new(false),
    }
  }

  pub fn hydrate_from_disk(&self, app: &AppHandle) {
    if let Some(mut persisted) = load_persisted(app) {
      if persisted.snapshot.status == SyncTaskStatus::Running {
        persisted.snapshot.status = SyncTaskStatus::Paused;
        persisted.snapshot.current_path = None;
        persisted.snapshot.updated_at = now_ms();
      }
      let pending: VecDeque<SyncItem> = persisted.pending_items.into_iter().collect();
      let completed_keys = derive_completed_keys(&persisted.all_items, &pending);
      *self.inner.lock() = Some(InnerTask {
        snapshot: persisted.snapshot,
        pending,
        all_items: persisted.all_items,
        completed_keys,
      });
      if let Some(task) = self.inner.lock().as_ref() {
        save_persisted(app, Some(&task.to_persisted()));
      }
    }
  }

  pub fn get_snapshot(&self) -> Option<SyncTaskSnapshot> {
    self.inner.lock().as_ref().map(|t| {
      let mut snap = t.snapshot.clone();
      snap.items = Some(build_item_snapshots(
        &t.all_items,
        &t.snapshot,
        &t.completed_keys,
      ));
      snap
    })
  }

  pub fn start(&self, app: AppHandle, request: StartSyncRequest) -> Result<SyncTaskSnapshot, String> {
    {
      let guard = self.inner.lock();
      if let Some(task) = guard.as_ref() {
        if task.snapshot.status == SyncTaskStatus::Running {
          if sources_same(&task.snapshot.left_source, &request.left_source)
            && sources_same(&task.snapshot.right_source, &request.right_source)
            && task.snapshot.direction == request.direction
          {
            drop(guard);
            return self.append_running(app, request);
          }
          return Err("已有同步任务正在运行".into());
        }
      }
    }

    let seeded = seed_sync_queues(&request.entries, &request.direction);
    let (pending, all_items) = self.expand_items(&app, &request, seeded.pending_items)?;
    let timestamp = now_ms();
    let total_items = all_items.len() as u64;
    let status = if total_items == 0 {
      SyncTaskStatus::Completed
    } else {
      SyncTaskStatus::Running
    };

    let snapshot = SyncTaskSnapshot {
      id: Uuid::new_v4().to_string(),
      left_source: request.left_source.clone(),
      right_source: request.right_source.clone(),
      direction: request.direction.clone(),
      status,
      total_items,
      completed_items: 0,
      current_path: None,
      last_completed_path: None,
      last_error: None,
      created_at: timestamp,
      updated_at: timestamp,
      items: None,
    };

    {
      let mut guard = self.inner.lock();
      *guard = Some(InnerTask {
        snapshot: snapshot.clone(),
        pending,
        all_items,
        completed_keys: HashSet::new(),
      });
    }
    self.commit_progress(&app, true);

    if snapshot.status == SyncTaskStatus::Running {
      log_bridge::emit_log(
        &app,
        LogScope::Sync,
        LogLevel::Info,
        match request.direction {
          SyncDirection::LeftToRight => "开始同步: 左 -> 右",
          SyncDirection::RightToLeft => "开始同步: 右 -> 左",
        },
      );
      self.ensure_loop(app);
    } else {
      log_bridge::emit_log(&app, LogScope::Sync, LogLevel::Info, "同步完成（无变更）");
    }

    Ok(self.get_snapshot().unwrap_or(snapshot))
  }

  fn append_running(
    &self,
    app: AppHandle,
    request: StartSyncRequest,
  ) -> Result<SyncTaskSnapshot, String> {
    let seeded = seed_sync_queues(&request.entries, &request.direction);
    let (_, incoming) = self.expand_items(&app, &request, seeded.pending_items)?;
    {
      let mut guard = self.inner.lock();
      let Some(task) = guard.as_mut() else {
        return Err("没有可追加的同步任务".into());
      };
      let existing: HashSet<String> = task
        .pending
        .iter()
        .chain(task.all_items.iter())
        .map(item_key)
        .collect();
      let mut appended = 0usize;
      for item in incoming {
        if existing.contains(&item_key(&item)) {
          continue;
        }
        task.pending.push_back(item.clone());
        task.all_items.push(item);
        appended += 1;
      }
      task.snapshot.total_items = task.all_items.len() as u64;
      task.snapshot.updated_at = now_ms();
      // 展开远端目录期间未持锁，任务可能已在此窗口内完成；有新增项则重新置为运行中
      if appended > 0 && task.snapshot.status == SyncTaskStatus::Completed {
        task.snapshot.status = SyncTaskStatus::Running;
      }
      if appended > 0 {
        log_bridge::emit_log(
          &app,
          LogScope::Sync,
          LogLevel::Info,
          format!("追加同步项: {appended} 项"),
        );
      }
    }
    self.commit_progress(&app, true);
    self.ensure_loop(app);
    self.get_snapshot().ok_or_else(|| "同步任务丢失".into())
  }

  fn expand_items(
    &self,
    app: &AppHandle,
    request: &StartSyncRequest,
    seed_items: Vec<SyncItem>,
  ) -> Result<(VecDeque<SyncItem>, Vec<SyncItem>), String> {
    let has_dirs = seed_items
      .iter()
      .any(|item| item.kind == SyncItemKind::Directory);
    if !has_dirs {
      let pending = seed_items.iter().cloned().collect();
      return Ok((pending, seed_items));
    }

    let (source_cfg, _) = source_pair(
      &request.direction,
      &request.left_source,
      &request.right_source,
    );
    let session = SourceSession::open(app, &source_cfg)?;
    let mut expanded_queue = VecDeque::from(seed_items);
    let mut collected = Vec::new();
    while let Some(item) = expanded_queue.pop_front() {
      let safe = assert_safe_relative(&item.relative_path)?;
      let item = SyncItem {
        relative_path: safe,
        kind: item.kind.clone(),
      };
      collected.push(item.clone());
      if item.kind == SyncItemKind::Directory {
        // 目录列取失败必须中止同步，静默按空目录处理会漏拷内容
        let children = session
          .list(&item.relative_path)
          .map_err(|e| format!("读取目录 {} 失败: {e}", item.relative_path))?;
        let child_pairs: Vec<(String, bool)> = children
          .into_iter()
          .map(|c| (c.name, c.is_directory))
          .collect();
        let expanded = expand_directory_entries(&item.relative_path, &child_pairs);
        for child in expanded.pending_items {
          expanded_queue.push_back(child);
        }
      }
    }
    Ok((collected.iter().cloned().collect(), collected))
  }

  pub fn pause(&self, app: &AppHandle) -> Option<SyncTaskSnapshot> {
    {
      let mut guard = self.inner.lock();
      if let Some(task) = guard.as_mut() {
        if task.snapshot.status == SyncTaskStatus::Running {
          task.snapshot.status = SyncTaskStatus::Paused;
          task.snapshot.current_path = None;
          task.snapshot.updated_at = now_ms();
        }
      }
    }
    self.commit_progress(app, true);
    self.get_snapshot()
  }

  pub fn resume(&self, app: AppHandle) -> Result<Option<SyncTaskSnapshot>, String> {
    {
      let mut guard = self.inner.lock();
      let Some(task) = guard.as_mut() else {
        return Ok(None);
      };
      if task.snapshot.status == SyncTaskStatus::Completed {
        return Ok(self.get_snapshot());
      }
      if task.snapshot.status == SyncTaskStatus::Running {
        return Ok(self.get_snapshot());
      }
      task.snapshot.status = SyncTaskStatus::Running;
      task.snapshot.last_error = None;
      task.snapshot.updated_at = now_ms();
    }
    self.commit_progress(&app, true);
    self.ensure_loop(app);
    Ok(self.get_snapshot())
  }

  pub fn clear(&self, app: &AppHandle) -> Result<(), String> {
    {
      let guard = self.inner.lock();
      if let Some(task) = guard.as_ref() {
        if task.snapshot.status == SyncTaskStatus::Running {
          return Err("同步进行中，无法清除任务".into());
        }
      }
    }
    *self.inner.lock() = None;
    save_persisted(app, None);
    let _ = app.emit("sync:progress", Option::<SyncTaskSnapshot>::None);
    Ok(())
  }

  fn ensure_loop(&self, app: AppHandle) {
    {
      let mut running = self.loop_running.lock();
      if *running {
        return;
      }
      *running = true;
    }
    let manager = sync_manager();
    tauri::async_runtime::spawn_blocking(move || loop {
      manager.run_loop(app.clone());
      // 锁顺序与 ensure_loop 一致：先 loop_running 后 inner，避免丢失唤醒
      let mut running = manager.loop_running.lock();
      let has_work = manager
        .inner
        .lock()
        .as_ref()
        .map(|task| {
          task.snapshot.status == SyncTaskStatus::Running && !task.pending.is_empty()
        })
        .unwrap_or(false);
      if !has_work {
        *running = false;
        break;
      }
    });
  }

  fn run_loop(&self, app: AppHandle) {
    let (direction, left, right) = {
      let guard = self.inner.lock();
      let Some(task) = guard.as_ref() else {
        return;
      };
      if task.snapshot.status != SyncTaskStatus::Running {
        return;
      }
      (
        task.snapshot.direction.clone(),
        task.snapshot.left_source.clone(),
        task.snapshot.right_source.clone(),
      )
    };

    let (source_cfg, target_cfg) = source_pair(&direction, &left, &right);
    let source = match SourceSession::open(&app, &source_cfg) {
      Ok(s) => s,
      Err(err) => {
        self.fail(&app, err);
        return;
      }
    };
    let target = match SourceSession::open(&app, &target_cfg) {
      Ok(s) => s,
      Err(err) => {
        self.fail(&app, err);
        return;
      }
    };

    loop {
      let item = {
        let mut guard = self.inner.lock();
        let Some(task) = guard.as_mut() else {
          break;
        };
        if task.snapshot.status != SyncTaskStatus::Running {
          break;
        }
        // 仅窥视队首，成功后才真正出队，失败时保留在 pending 供 resume 重试
        let Some(item) = task.pending.front().cloned() else {
          task.snapshot.status = SyncTaskStatus::Completed;
          task.snapshot.current_path = None;
          task.snapshot.updated_at = now_ms();
          drop(guard);
          self.commit_progress(&app, true);
          log_bridge::emit_log(&app, LogScope::Sync, LogLevel::Info, "同步完成");
          break;
        };
        task.snapshot.current_path = Some(item.relative_path.clone());
        task.snapshot.updated_at = now_ms();
        drop(guard);
        self.publish_progress(&app);
        item
      };

      let relative = match assert_safe_relative(&item.relative_path) {
        Ok(path) => path,
        Err(err) => {
          self.fail(&app, err);
          break;
        }
      };

      let exec = match item.kind {
        SyncItemKind::Directory => target.ensure_dir(&relative),
        SyncItemKind::File => {
          if let Some(parent) = parent_of(&relative) {
            let _ = target.ensure_dir(&parent);
          }
          copy_between(&source, &target, &relative)
        }
      };

      if let Err(err) = exec {
        self.fail(&app, err);
        break;
      }

      {
        let mut guard = self.inner.lock();
        let Some(task) = guard.as_mut() else {
          break;
        };
        task.pending.pop_front();
        task.completed_keys.insert(item_key(&item));
        task.snapshot.completed_items += 1;
        task.snapshot.current_path = None;
        task.snapshot.last_completed_path.replace(relative);
        task.snapshot.updated_at = now_ms();
      }
      self.publish_progress(&app);
    }
  }

  fn fail(&self, app: &AppHandle, message: String) {
    log_bridge::emit_log(app, LogScope::Sync, LogLevel::Error, format!("同步失败: {message}"));
    {
      let mut guard = self.inner.lock();
      if let Some(task) = guard.as_mut() {
        task.snapshot.status = SyncTaskStatus::Failed;
        task.snapshot.current_path = None;
        task.snapshot.last_error = Some(message);
        task.snapshot.updated_at = now_ms();
      }
    }
    self.commit_progress(app, true);
  }

  fn publish_progress(&self, app: &AppHandle) {
    *self.dirty.lock() = true;
    let elapsed = self.last_notify.lock().elapsed().as_millis();
    if elapsed >= PROGRESS_NOTIFY_MS {
      self.commit_progress(app, false);
    }
  }

  fn commit_progress(&self, app: &AppHandle, force_persist: bool) {
    *self.dirty.lock() = false;
    *self.last_notify.lock() = Instant::now();

    let snapshot = self.get_snapshot();
    let _ = app.emit("sync:progress", snapshot.clone());

    let should_persist = force_persist
      || self.last_persist.lock().elapsed().as_millis() >= PERSIST_INTERVAL_MS;
    if should_persist {
      *self.last_persist.lock() = Instant::now();
      if let Some(task) = self.inner.lock().as_ref() {
        save_persisted(app, Some(&task.to_persisted()));
      } else {
        save_persisted(app, None);
      }
    }
  }
}

fn parent_of(relative: &str) -> Option<String> {
  let normalized = crate::path_utils::normalize_relative(relative);
  let mut parts: Vec<&str> = normalized.split('/').filter(|p| !p.is_empty()).collect();
  if parts.len() <= 1 {
    return None;
  }
  parts.pop();
  Some(parts.join("/"))
}

fn derive_completed_keys(all: &[SyncItem], pending: &VecDeque<SyncItem>) -> HashSet<String> {
  let pending_keys: HashSet<String> = pending.iter().map(item_key).collect();
  all
    .iter()
    .map(item_key)
    .filter(|key| !pending_keys.contains(key))
    .collect()
}

fn build_item_snapshots(
  all: &[SyncItem],
  task: &SyncTaskSnapshot,
  completed_keys: &HashSet<String>,
) -> Vec<SyncTaskItemSnapshot> {
  all
    .iter()
    .map(|item| {
      let status = if completed_keys.contains(&item_key(item)) {
        SyncTaskItemStatus::Completed
      } else if task.status == SyncTaskStatus::Running
        && task.current_path.as_deref() == Some(item.relative_path.as_str())
      {
        SyncTaskItemStatus::Running
      } else {
        SyncTaskItemStatus::Pending
      };
      SyncTaskItemSnapshot {
        relative_path: item.relative_path.clone(),
        kind: item.kind.clone(),
        status,
      }
    })
    .collect()
}

static SYNC_MANAGER: once_cell::sync::Lazy<Arc<SyncManager>> =
  once_cell::sync::Lazy::new(|| Arc::new(SyncManager::new()));

pub fn sync_manager() -> Arc<SyncManager> {
  SYNC_MANAGER.clone()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn file_item(path: &str) -> SyncItem {
    SyncItem {
      relative_path: path.into(),
      kind: SyncItemKind::File,
    }
  }

  fn dir_item(path: &str) -> SyncItem {
    SyncItem {
      relative_path: path.into(),
      kind: SyncItemKind::Directory,
    }
  }

  fn snapshot_with(status: SyncTaskStatus, current_path: Option<&str>) -> SyncTaskSnapshot {
    SyncTaskSnapshot {
      id: "task".into(),
      left_source: SourceConfig::Local { path: "/l".into() },
      right_source: SourceConfig::Local { path: "/r".into() },
      direction: SyncDirection::LeftToRight,
      status,
      total_items: 0,
      completed_items: 0,
      current_path: current_path.map(|p| p.to_string()),
      last_completed_path: None,
      last_error: None,
      created_at: 0,
      updated_at: 0,
      items: None,
    }
  }

  #[test]
  fn item_key_distinguishes_kind() {
    assert_ne!(item_key(&dir_item("x")), item_key(&file_item("x")));
  }

  #[test]
  fn build_item_snapshots_uses_completed_keys_not_index() {
    let all = vec![file_item("a.txt"), file_item("b.txt"), file_item("c.txt")];
    let mut task = snapshot_with(SyncTaskStatus::Running, Some("a.txt"));
    task.completed_items = 1;
    // 完成顺序与 all_items 顺序不一致：只有 b.txt 已完成
    let completed: HashSet<String> = [item_key(&all[1])].into_iter().collect();
    let items = build_item_snapshots(&all, &task, &completed);
    assert_eq!(items[0].status, SyncTaskItemStatus::Running);
    assert_eq!(items[1].status, SyncTaskItemStatus::Completed);
    assert_eq!(items[2].status, SyncTaskItemStatus::Pending);
  }

  #[test]
  fn build_item_snapshots_ignores_current_path_when_not_running() {
    let all = vec![file_item("a.txt")];
    let task = snapshot_with(SyncTaskStatus::Paused, Some("a.txt"));
    let items = build_item_snapshots(&all, &task, &HashSet::new());
    assert_eq!(items[0].status, SyncTaskItemStatus::Pending);
  }

  #[test]
  fn derive_completed_keys_excludes_pending_items() {
    let all = vec![dir_item("dir"), file_item("dir/a.txt"), file_item("dir/b.txt")];
    let pending: VecDeque<SyncItem> = vec![file_item("dir/a.txt"), file_item("dir/b.txt")].into();
    let keys = derive_completed_keys(&all, &pending);
    assert_eq!(keys.len(), 1);
    assert!(keys.contains(&item_key(&all[0])));
    assert!(!keys.contains(&item_key(&all[1])));
  }
}
