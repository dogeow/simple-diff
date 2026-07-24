use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Emitter};

use crate::files::{file_quick_hash, file_sha256, list_directory_relative};
use crate::path_utils::{join_path, matches_path_filter, normalize_relative};
use crate::types::{
  CompareCacheEntry, CompareEntry, CompareResult, CompareState, CompareStats, DiffReason,
  FileEntry, SourceConfig, StrategyName,
};

pub struct CompareCallbacks<'a> {
  pub app: &'a AppHandle,
  pub compare_id: &'a str,
  pub cancelled: Arc<AtomicBool>,
}

struct PendingDirectoryScan {
  rel: String,
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

fn compare_file(
  left_root: &str,
  right_root: &str,
  left: &FileEntry,
  right: &FileEntry,
  strategies: &[StrategyName],
) -> Result<(CompareState, Vec<DiffReason>), String> {
  let left_abs = join_path(left_root, &left.path);
  let right_abs = join_path(right_root, &right.path);
  let left_path = Path::new(&left_abs);
  let right_path = Path::new(&right_abs);

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
        let left_hash = file_quick_hash(left_path)?;
        let right_hash = file_quick_hash(right_path)?;
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
        let left_hash = file_sha256(left_path)?;
        let right_hash = file_sha256(right_path)?;
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
          continue;
        }
        entries.push(CompareEntry {
          relative_path,
          name,
          is_directory: false,
          state: CompareState::Pending,
          left: Some(left.clone()),
          right: Some(right.clone()),
          reasons: Vec::new(),
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
  left: &SourceConfig,
  right: &SourceConfig,
  relative_roots: &[String],
  strategies: &[StrategyName],
  extension_filter: Option<&[String]>,
  previous_entries: Option<&[CompareCacheEntry]>,
  retain_entries: bool,
  callbacks: Option<&CompareCallbacks<'_>>,
) -> Result<CompareResult, String> {
  let left_root = left.local_path()?.to_string();
  let right_root = right.local_path()?.to_string();
  let path_filters = extension_filter.unwrap_or(&[]).to_vec();

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

    for scan in &current_level {
      let left_list = list_directory_relative(&left_root, &scan.rel).unwrap_or_default();
      let right_list = list_directory_relative(&right_root, &scan.rel).unwrap_or_default();
      let matched = match_level(&left_list, &right_list, &scan.rel, &path_filters, &reusable);
      level_entries.extend(matched);
    }

    if let Some(cb) = callbacks {
      let _ = cb.app.emit(
        "compare:scan-complete",
        (cb.compare_id.to_string(), level_entries.clone()),
      );
    }

    for mut entry in level_entries {
      if let Some(cb) = callbacks {
        throw_if_cancelled(&cb.cancelled)?;
      }

      if entry.is_directory {
        match entry.state {
          CompareState::Pending => {
            next_level.push(PendingDirectoryScan {
              rel: entry.relative_path.clone(),
            });
            if retain_entries {
              all_entries.push(entry);
            }
          }
          CompareState::LeftOnly | CompareState::RightOnly => {
            bump_stats(&mut stats, &entry.state);
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
        continue;
      }

      if entry.state == CompareState::Pending {
        if let (Some(left_fe), Some(right_fe)) = (&entry.left, &entry.right) {
          match compare_file(&left_root, &right_root, left_fe, right_fe, strategies) {
            Ok((state, reasons)) => {
              entry.state = state;
              entry.reasons = reasons;
            }
            Err(_) => {
              entry.state = CompareState::Different;
            }
          }
        }
      }

      bump_stats(&mut stats, &entry.state);

      if let Some(cb) = callbacks {
        let _ = cb.app.emit(
          "compare:entry-update",
          (cb.compare_id.to_string(), vec![entry.clone()]),
        );
      }

      if retain_entries {
        all_entries.push(entry);
      }
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
