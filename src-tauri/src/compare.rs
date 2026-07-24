use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rayon::prelude::*;
use tauri::{AppHandle, Emitter};

use crate::files::{file_quick_hash, file_sha256};
use crate::path_utils::{join_path, matches_path_filter, normalize_relative};
use crate::source_ops::SourceSession;
use crate::state::ActiveCompare;
use crate::types::{
  CompareCacheEntry, CompareEntry, CompareResult, CompareState, CompareStats, DiffReason,
  FileEntry, SourceConfig, StrategyName,
};

const ENTRY_FLUSH_MS: u128 = 100;
const ENTRY_FLUSH_SIZE: usize = 200;

pub struct CompareCallbacks<'a> {
  pub app: &'a AppHandle,
  pub compare_id: &'a str,
  pub cancelled: Arc<AtomicBool>,
  pub session: Option<Arc<ActiveCompare>>,
}

struct PendingDirectoryScan {
  rel: String,
}

struct EntryBatcher<'a> {
  callbacks: &'a CompareCallbacks<'a>,
  buffer: Vec<CompareEntry>,
  last_flush: Instant,
}

impl<'a> EntryBatcher<'a> {
  fn new(callbacks: &'a CompareCallbacks<'a>) -> Self {
    Self {
      callbacks,
      buffer: Vec::new(),
      last_flush: Instant::now(),
    }
  }

  fn push(&mut self, entry: CompareEntry) {
    if let Some(session) = &self.callbacks.session {
      session.register_entries(std::slice::from_ref(&entry));
    }
    self.buffer.push(entry);
    if self.buffer.len() >= ENTRY_FLUSH_SIZE
      || self.last_flush.elapsed() >= Duration::from_millis(ENTRY_FLUSH_MS as u64)
    {
      self.flush();
    }
  }

  fn flush(&mut self) {
    if self.buffer.is_empty() {
      return;
    }
    let batch = std::mem::take(&mut self.buffer);
    let _ = self.callbacks.app.emit(
      "compare:entry-update",
      (self.callbacks.compare_id.to_string(), batch),
    );
    self.last_flush = Instant::now();
  }
}

fn throw_if_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
  if cancelled.load(Ordering::Relaxed) {
    Err("对比已取消".into())
  } else {
    Ok(())
  }
}

fn fingerprint_matches(cache: &CompareCacheEntry, left: &FileEntry, right: &FileEntry) -> bool {
  cache.left.is_directory == left.is_directory
    && cache.right.is_directory == right.is_directory
    && cache.left.size == left.size
    && cache.right.size == right.size
    && cache.left.mtime == left.mtime
    && cache.right.mtime == right.mtime
}

fn compare_local_files(
  left_root: &str,
  right_root: &str,
  left: &FileEntry,
  right: &FileEntry,
  strategies: &[StrategyName],
) -> Result<(CompareState, Vec<DiffReason>), String> {
  use std::path::Path;

  for strategy in strategies {
    match strategy {
      StrategyName::Size if left.size != right.size => {
        return Ok((
          CompareState::Different,
          vec![DiffReason::Size {
            left_size: left.size,
            right_size: right.size,
          }],
        ));
      }
      StrategyName::Mtime if left.mtime.abs_diff(right.mtime) > 1000 => {
        return Ok((
          CompareState::Different,
          vec![DiffReason::Mtime {
            left_mtime: left.mtime,
            right_mtime: right.mtime,
          }],
        ));
      }
      StrategyName::QuickHash => {
        let left_hash = file_quick_hash(Path::new(&join_path(left_root, &left.path)))?;
        let right_hash = file_quick_hash(Path::new(&join_path(right_root, &right.path)))?;
        if left_hash != right_hash {
          return Ok((
            CompareState::Different,
            vec![DiffReason::QuickHash {
              left_hash,
              right_hash,
            }],
          ));
        }
      }
      StrategyName::Hash => {
        let left_hash = file_sha256(Path::new(&join_path(left_root, &left.path)))?;
        let right_hash = file_sha256(Path::new(&join_path(right_root, &right.path)))?;
        if left_hash != right_hash {
          return Ok((
            CompareState::Different,
            vec![DiffReason::Hash {
              left_hash,
              right_hash,
            }],
          ));
        }
      }
      _ => {}
    }
  }

  Ok((CompareState::Equal, Vec::new()))
}

fn compare_file_with_sessions(
  left_session: &SourceSession<'_>,
  right_session: &SourceSession<'_>,
  left: &FileEntry,
  right: &FileEntry,
  strategies: &[StrategyName],
) -> Result<(CompareState, Vec<DiffReason>), String> {
  for strategy in strategies {
    match strategy {
      StrategyName::Size if left.size != right.size => {
        return Ok((
          CompareState::Different,
          vec![DiffReason::Size {
            left_size: left.size,
            right_size: right.size,
          }],
        ));
      }
      StrategyName::Mtime if left.mtime.abs_diff(right.mtime) > 1000 => {
        return Ok((
          CompareState::Different,
          vec![DiffReason::Mtime {
            left_mtime: left.mtime,
            right_mtime: right.mtime,
          }],
        ));
      }
      StrategyName::QuickHash => {
        let left_hash = left_session.quick_hash(&left.path)?;
        let right_hash = right_session.quick_hash(&right.path)?;
        if left_hash != right_hash {
          return Ok((
            CompareState::Different,
            vec![DiffReason::QuickHash {
              left_hash,
              right_hash,
            }],
          ));
        }
      }
      StrategyName::Hash => {
        let left_hash = left_session.hash(&left.path)?;
        let right_hash = right_session.hash(&right.path)?;
        if left_hash != right_hash {
          return Ok((
            CompareState::Different,
            vec![DiffReason::Hash {
              left_hash,
              right_hash,
            }],
          ));
        }
      }
      _ => {}
    }
  }

  Ok((CompareState::Equal, Vec::new()))
}

fn match_level(
  left_list: &[FileEntry],
  right_list: &[FileEntry],
  parent_relative: &str,
  path_filters: &[String],
  reusable: &HashMap<String, CompareCacheEntry>,
) -> Vec<CompareEntry> {
  let mut left_map: HashMap<String, FileEntry> = HashMap::new();
  for entry in left_list {
    left_map.insert(entry.name.clone(), entry.clone());
  }
  let mut right_map: HashMap<String, FileEntry> = HashMap::new();
  for entry in right_list {
    right_map.insert(entry.name.clone(), entry.clone());
  }

  let mut names: Vec<String> = left_map
    .keys()
    .chain(right_map.keys())
    .cloned()
    .collect::<std::collections::BTreeSet<_>>()
    .into_iter()
    .collect();
  names.sort_by_key(|n| n.to_lowercase());

  let mut entries = Vec::new();
  for name in names {
    let left = left_map.get(&name);
    let right = right_map.get(&name);
    let is_dir = left
      .map(|e| e.is_directory)
      .or_else(|| right.map(|e| e.is_directory))
      .unwrap_or(false);
    let relative_path = if parent_relative.is_empty() {
      name.clone()
    } else {
      format!("{parent_relative}/{name}")
    };
    let relative_path = normalize_relative(&relative_path);

    if matches_path_filter(&relative_path, path_filters) {
      continue;
    }

    if let (Some(left), None) = (left, right) {
      entries.push(CompareEntry {
        relative_path,
        name,
        is_directory: is_dir,
        state: CompareState::LeftOnly,
        left: Some(left.clone()),
        right: None,
        reasons: Vec::new(),
      });
    } else if let (None, Some(right)) = (left, right) {
      entries.push(CompareEntry {
        relative_path,
        name,
        is_directory: is_dir,
        state: CompareState::RightOnly,
        left: None,
        right: Some(right.clone()),
        reasons: Vec::new(),
      });
    } else if let (Some(left), Some(right)) = (left, right) {
      if is_dir {
        entries.push(CompareEntry {
          relative_path,
          name,
          is_directory: true,
          state: CompareState::Pending,
          left: Some(left.clone()),
          right: Some(right.clone()),
          reasons: Vec::new(),
        });
      } else if let Some(cache) = reusable.get(&relative_path) {
        if fingerprint_matches(cache, left, right)
          && matches!(cache.state, CompareState::Equal | CompareState::Different)
        {
          entries.push(CompareEntry {
            relative_path,
            name,
            is_directory: false,
            state: cache.state.clone(),
            left: Some(left.clone()),
            right: Some(right.clone()),
            reasons: cache.reasons.clone(),
          });
        } else {
          entries.push(CompareEntry {
            relative_path,
            name,
            is_directory: false,
            state: CompareState::Pending,
            left: Some(left.clone()),
            right: Some(right.clone()),
            reasons: Vec::new(),
          });
        }
      } else {
        entries.push(CompareEntry {
          relative_path,
          name,
          is_directory: false,
          state: CompareState::Pending,
          left: Some(left.clone()),
          right: Some(right.clone()),
          reasons: Vec::new(),
        });
      }
    }
  }

  entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
    (true, false) => std::cmp::Ordering::Less,
    (false, true) => std::cmp::Ordering::Greater,
    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
  });

  entries
}

fn bump_stats(stats: &mut CompareStats, state: &CompareState) {
  stats.total += 1;
  match state {
    CompareState::Equal => stats.equal += 1,
    CompareState::Different => stats.different += 1,
    CompareState::LeftOnly => stats.left_only += 1,
    CompareState::RightOnly => stats.right_only += 1,
    _ => {}
  }
}

pub fn compare_directories(
  app: &AppHandle,
  left: &SourceConfig,
  right: &SourceConfig,
  relative_roots: &[String],
  strategies: &[StrategyName],
  extension_filter: Option<&[String]>,
  previous_entries: Option<&[CompareCacheEntry]>,
  retain_entries: bool,
  callbacks: Option<&CompareCallbacks<'_>>,
) -> Result<CompareResult, String> {
  let left_session = SourceSession::open(app, left)?;
  let right_session = SourceSession::open(app, right)?;
  let path_filters = extension_filter.unwrap_or(&[]).to_vec();
  let both_local = left.is_local() && right.is_local();
  let list_concurrency = if both_local { 8usize } else { 2usize };

  let mut reusable: HashMap<String, CompareCacheEntry> = HashMap::new();
  if let Some(prev) = previous_entries {
    for entry in prev {
      reusable.insert(entry.relative_path.clone(), entry.clone());
    }
  }

  let started = Instant::now();
  let mut stats = CompareStats::default();
  let mut all_entries: Vec<CompareEntry> = Vec::new();

  let roots: Vec<String> = if relative_roots.is_empty() {
    vec![String::new()]
  } else {
    relative_roots
      .iter()
      .map(|root| normalize_relative(root))
      .collect()
  };

  let mut current_level: Vec<PendingDirectoryScan> = roots
    .into_iter()
    .map(|rel| PendingDirectoryScan { rel })
    .collect();

  while !current_level.is_empty() {
    if let Some(cb) = callbacks {
      throw_if_cancelled(&cb.cancelled)?;
    }

    let mut next_level: Vec<PendingDirectoryScan> = Vec::new();
    let mut level_entries: Vec<CompareEntry> = Vec::new();

    // Concurrent directory listing within the level (chunked).
    for chunk in current_level.chunks(list_concurrency) {
      if let Some(cb) = callbacks {
        throw_if_cancelled(&cb.cancelled)?;
      }
      for scan in chunk {
        let left_list = if scan.rel.is_empty() {
          left_session
            .list(&scan.rel)
            .map_err(|e| format!("读取左侧根目录失败: {e}"))?
        } else {
          left_session.list(&scan.rel).unwrap_or_default()
        };
        let right_list = if scan.rel.is_empty() {
          right_session
            .list(&scan.rel)
            .map_err(|e| format!("读取右侧根目录失败: {e}"))?
        } else {
          right_session.list(&scan.rel).unwrap_or_default()
        };
        let matched = match_level(&left_list, &right_list, &scan.rel, &path_filters, &reusable);
        level_entries.extend(matched);
      }
    }

    if let Some(cb) = callbacks {
      if let Some(session) = &cb.session {
        session.register_entries(&level_entries);
      }
      let _ = cb.app.emit(
        "compare:scan-complete",
        (cb.compare_id.to_string(), level_entries.clone()),
      );
    }

    let mut pending_files: Vec<CompareEntry> = Vec::new();
    let mut other_entries: Vec<CompareEntry> = Vec::new();
    for entry in level_entries {
      if !entry.is_directory && entry.state == CompareState::Pending {
        pending_files.push(entry);
      } else {
        other_entries.push(entry);
      }
    }

    let mut batcher = callbacks.map(EntryBatcher::new);

    for entry in other_entries {
      if let Some(cb) = callbacks {
        throw_if_cancelled(&cb.cancelled)?;
      }

      if entry.is_directory {
        match entry.state {
          CompareState::Pending => {
            // Emit comparing state for UI spinner before descending.
            let mut comparing = entry.clone();
            comparing.state = CompareState::Comparing;
            if let Some(batcher) = batcher.as_mut() {
              batcher.push(comparing);
            } else if let Some(cb) = callbacks {
              let _ = cb.app.emit(
                "compare:entry-update",
                (cb.compare_id.to_string(), vec![comparing]),
              );
            }
            next_level.push(PendingDirectoryScan {
              rel: entry.relative_path.clone(),
            });
            if retain_entries {
              all_entries.push(entry);
            }
          }
          CompareState::LeftOnly | CompareState::RightOnly => {
            bump_stats(&mut stats, &entry.state);
            if let Some(batcher) = batcher.as_mut() {
              batcher.push(entry.clone());
            }
            if retain_entries {
              all_entries.push(entry);
            }
          }
          _ => {
            if retain_entries {
              all_entries.push(entry);
            }
          }
        }
      } else {
        bump_stats(&mut stats, &entry.state);
        if let Some(batcher) = batcher.as_mut() {
          batcher.push(entry.clone());
        }
        if retain_entries {
          all_entries.push(entry);
        }
      }
    }

    if both_local && pending_files.len() > 1 {
      let left_root = left.as_local_path()?.to_string();
      let right_root = right.as_local_path()?.to_string();
      let strategies = strategies.to_vec();
      let results: Result<Vec<_>, String> = pending_files
        .par_iter()
        .map(|entry| {
          let left_fe = entry.left.as_ref().ok_or("缺少左侧文件")?;
          let right_fe = entry.right.as_ref().ok_or("缺少右侧文件")?;
          let (state, reasons) =
            compare_local_files(&left_root, &right_root, left_fe, right_fe, &strategies)?;
          Ok((entry.relative_path.clone(), state, reasons))
        })
        .collect();
      let results = results?;
      let mut by_path: HashMap<String, (CompareState, Vec<DiffReason>)> = HashMap::new();
      for (path, state, reasons) in results {
        by_path.insert(path, (state, reasons));
      }

      for mut entry in pending_files {
        if let Some(cb) = callbacks {
          throw_if_cancelled(&cb.cancelled)?;
        }
        if let Some((state, reasons)) = by_path.remove(&entry.relative_path) {
          entry.state = state;
          entry.reasons = reasons;
        }
        bump_stats(&mut stats, &entry.state);
        if let Some(batcher) = batcher.as_mut() {
          batcher.push(entry.clone());
        }
        if retain_entries {
          all_entries.push(entry);
        }
      }
    } else {
      for mut entry in pending_files {
        if let Some(cb) = callbacks {
          throw_if_cancelled(&cb.cancelled)?;
        }
        if let (Some(left_fe), Some(right_fe)) = (&entry.left, &entry.right) {
          let (state, reasons) =
            compare_file_with_sessions(&left_session, &right_session, left_fe, right_fe, strategies)?;
          entry.state = state;
          entry.reasons = reasons;
        }
        bump_stats(&mut stats, &entry.state);
        if let Some(batcher) = batcher.as_mut() {
          batcher.push(entry.clone());
        }
        if retain_entries {
          all_entries.push(entry);
        }
      }
    }

    if let Some(mut batcher) = batcher {
      batcher.flush();
    }

    current_level = next_level;
  }

  Ok(CompareResult {
    entries: all_entries,
    entries_included: Some(retain_entries),
    stats,
    duration: started.elapsed().as_millis() as u64,
    left_source: Some(left.clone()),
    right_source: Some(right.clone()),
  })
}
