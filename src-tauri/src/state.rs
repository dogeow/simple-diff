use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use parking_lot::Mutex;

pub struct ActiveCompare {
  pub cancelled: Arc<AtomicBool>,
}

pub struct AppState {
  pub active_compares: Mutex<HashMap<String, ActiveCompare>>,
  pub watch_manager: crate::watch::SharedWatchManager,
}

impl AppState {
  pub fn new() -> Self {
    Self {
      active_compares: Mutex::new(HashMap::new()),
      watch_manager: Arc::new(crate::watch::WatchManager::new()),
    }
  }

  pub fn cancel_compare(&self, compare_id: Option<&str>) {
    let compares = self.active_compares.lock();
    if let Some(id) = compare_id {
      if let Some(active) = compares.get(id) {
        active
          .cancelled
          .store(true, std::sync::atomic::Ordering::Relaxed);
      }
    } else {
      for active in compares.values() {
        active
          .cancelled
          .store(true, std::sync::atomic::Ordering::Relaxed);
      }
    }
  }
}
