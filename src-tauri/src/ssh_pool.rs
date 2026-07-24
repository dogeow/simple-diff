use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use ssh2::{Session, Sftp};

use crate::ssh::{self, is_connection_error};
use crate::types::SshConfigInternal;

static POOL: Lazy<ConnectionManager> = Lazy::new(ConnectionManager::new);

/// Pooled or isolated SSH connection with optional cached SFTP + known remote dirs.
pub struct PooledConn {
  pub session: Session,
  sftp: Option<Sftp>,
  known_dirs: HashSet<String>,
  #[allow(dead_code)]
  config_id: String,
  #[allow(dead_code)]
  isolated: bool,
}

impl PooledConn {
  fn new(session: Session, config_id: String, isolated: bool) -> Self {
    Self {
      session,
      sftp: None,
      known_dirs: HashSet::new(),
      config_id,
      isolated,
    }
  }

  #[allow(dead_code)]
  pub fn config_id(&self) -> &str {
    &self.config_id
  }

  #[allow(dead_code)]
  pub fn is_isolated(&self) -> bool {
    self.isolated
  }

  pub fn known_dirs_mut(&mut self) -> &mut HashSet<String> {
    &mut self.known_dirs
  }

  pub fn reset_sftp(&mut self) {
    self.sftp = None;
  }

  /// Take or open a cached SFTP handle. Caller must restore via [`restore_sftp`].
  pub fn take_sftp(&mut self) -> Result<Sftp, String> {
    if let Some(sftp) = self.sftp.take() {
      return Ok(sftp);
    }
    self
      .session
      .sftp()
      .map_err(|e| format!("打开 SFTP 失败: {e}"))
  }

  pub fn restore_sftp(&mut self, sftp: Sftp) {
    self.sftp = Some(sftp);
  }
}

struct ConnectionManager {
  pool: Mutex<HashMap<String, Arc<Mutex<PooledConn>>>>,
}

impl ConnectionManager {
  fn new() -> Self {
    Self {
      pool: Mutex::new(HashMap::new()),
    }
  }

  fn connect_shared(&self, config: &SshConfigInternal) -> Result<Arc<Mutex<PooledConn>>, String> {
    {
      let guard = self.pool.lock();
      if let Some(existing) = guard.get(&config.id) {
        return Ok(Arc::clone(existing));
      }
    }

    let session = ssh::connect_session(config)?;
    let conn = Arc::new(Mutex::new(PooledConn::new(
      session,
      config.id.clone(),
      false,
    )));

    let mut guard = self.pool.lock();
    // Another thread may have inserted while we connected.
    if let Some(existing) = guard.get(&config.id) {
      return Ok(Arc::clone(existing));
    }
    guard.insert(config.id.clone(), Arc::clone(&conn));
    Ok(conn)
  }

  fn connect_isolated(&self, config: &SshConfigInternal) -> Result<PooledConn, String> {
    let session = ssh::connect_session(config)?;
    Ok(PooledConn::new(session, config.id.clone(), true))
  }

  fn invalidate(&self, config_id: &str) {
    self.pool.lock().remove(config_id);
  }
}

/// Shared pooled session keyed by SSH config id (reused across short ops).
pub fn connect_shared(config: &SshConfigInternal) -> Result<Arc<Mutex<PooledConn>>, String> {
  POOL.connect_shared(config)
}

/// Isolated session — not pooled; dispose after long-running compare/sync.
pub fn connect_isolated(config: &SshConfigInternal) -> Result<PooledConn, String> {
  POOL.connect_isolated(config)
}

/// Drop a pooled connection after a hard failure so the next call reconnects.
pub fn invalidate(config_id: &str) {
  POOL.invalidate(config_id);
}

/// Run an operation on a shared connection; invalidate pool entry on connection errors.
pub fn with_shared<T>(
  config: &SshConfigInternal,
  f: impl FnOnce(&Session) -> Result<T, String>,
) -> Result<T, String> {
  let arc = connect_shared(config)?;
  let result = {
    let guard = arc.lock();
    f(&guard.session)
  };
  if let Err(ref err) = result {
    if is_connection_error(err) {
      invalidate(&config.id);
    }
  }
  result
}

/// Run a mutably-borrowing op on a shared connection (e.g. ensure_dir with known_dirs).
#[allow(dead_code)]
pub fn with_shared_mut<T>(
  config: &SshConfigInternal,
  f: impl FnOnce(&mut PooledConn) -> Result<T, String>,
) -> Result<T, String> {
  let arc = connect_shared(config)?;
  let result = {
    let mut guard = arc.lock();
    f(&mut guard)
  };
  if let Err(ref err) = result {
    if is_connection_error(err) {
      invalidate(&config.id);
    }
  }
  result
}
