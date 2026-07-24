use crate::types::{CompareEntry, CompareState, SyncDirection, SyncItem, SyncItemKind};

pub struct SeededSyncQueues {
  pub pending_items: Vec<SyncItem>,
  #[allow(dead_code)]
  pub pending_dirs: Vec<String>,
  #[allow(dead_code)]
  pub total_items: usize,
}

fn should_sync_entry(entry: &CompareEntry, direction: &SyncDirection) -> bool {
  if entry.state == CompareState::Different {
    return !entry.is_directory;
  }
  if entry.is_directory {
    return match direction {
      SyncDirection::LeftToRight => entry.state == CompareState::LeftOnly,
      SyncDirection::RightToLeft => entry.state == CompareState::RightOnly,
    };
  }
  match direction {
    SyncDirection::LeftToRight => entry.state == CompareState::LeftOnly,
    SyncDirection::RightToLeft => entry.state == CompareState::RightOnly,
  }
}

pub fn seed_sync_queues(entries: &[CompareEntry], direction: &SyncDirection) -> SeededSyncQueues {
  let mut pending_items = Vec::new();
  let mut pending_dirs = Vec::new();

  for entry in entries {
    if !should_sync_entry(entry, direction) {
      continue;
    }
    if entry.is_directory {
      pending_items.push(SyncItem {
        relative_path: entry.relative_path.clone(),
        kind: SyncItemKind::Directory,
      });
      pending_dirs.push(entry.relative_path.clone());
    } else {
      pending_items.push(SyncItem {
        relative_path: entry.relative_path.clone(),
        kind: SyncItemKind::File,
      });
    }
  }

  let total_items = pending_items.len();
  SeededSyncQueues {
    pending_items,
    pending_dirs,
    total_items,
  }
}

pub fn expand_directory_entries(
  parent_relative: &str,
  children: &[(String, bool)],
) -> SeededSyncQueues {
  let mut pending_items = Vec::new();
  let mut pending_dirs = Vec::new();
  let mut sorted = children.to_vec();
  sorted.sort_by(|a, b| match (a.1, b.1) {
    (true, false) => std::cmp::Ordering::Less,
    (false, true) => std::cmp::Ordering::Greater,
    _ => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
  });

  for (name, is_dir) in sorted {
    let relative_path = if parent_relative.is_empty() {
      name
    } else {
      format!("{parent_relative}/{name}")
    };
    if is_dir {
      pending_items.push(SyncItem {
        relative_path: relative_path.clone(),
        kind: SyncItemKind::Directory,
      });
      pending_dirs.push(relative_path);
    } else {
      pending_items.push(SyncItem {
        relative_path,
        kind: SyncItemKind::File,
      });
    }
  }

  let total_items = pending_items.len();
  SeededSyncQueues {
    pending_items,
    pending_dirs,
    total_items,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::types::{CompareEntry, CompareState, SyncDirection, SyncItemKind};

  #[test]
  fn seeds_left_only_files() {
    let entries = vec![CompareEntry {
      relative_path: "a.txt".into(),
      name: "a.txt".into(),
      is_directory: false,
      state: CompareState::LeftOnly,
      left: None,
      right: None,
      reasons: Vec::new(),
    }];
    let seeded = seed_sync_queues(&entries, &SyncDirection::LeftToRight);
    assert_eq!(seeded.pending_items.len(), 1);
    assert_eq!(seeded.pending_items[0].kind, SyncItemKind::File);
  }

  #[test]
  fn expand_orders_directories_first() {
    let expanded = expand_directory_entries(
      "root",
      &[("b.txt".into(), false), ("a".into(), true)],
    );
    assert_eq!(expanded.pending_items[0].kind, SyncItemKind::Directory);
    assert_eq!(expanded.pending_items[0].relative_path, "root/a");
    assert_eq!(expanded.pending_items[1].kind, SyncItemKind::File);
  }
}
