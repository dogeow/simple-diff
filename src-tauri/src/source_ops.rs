use std::path::Path;

use tauri::AppHandle;

use crate::files::{
  copy_local_file, delete_file, file_quick_hash, file_sha256, list_directory_relative, read_text,
  rename_file, resolve_local_abs, write_text,
};
use crate::path_guards::relative_under_source;
use crate::path_utils::join_path;
use crate::ssh::{
  delete_remote, ensure_remote_dir_on, list_remote, read_remote_bytes, read_remote_text,
  remote_quick_hash, remote_sha256, rename_remote, write_remote_bytes, write_remote_text,
};
use crate::ssh_pool::{self, PooledConn};
use crate::ssh_store;
use crate::types::{FileEntry, SourceConfig};

/// List directory for IPC. `dir_path` may be absolute (UI lazy-load) or relative.
pub fn list_entries(
  app: &AppHandle,
  source: &SourceConfig,
  dir_path: &str,
) -> Result<Vec<FileEntry>, String> {
  match source {
    SourceConfig::Local { path } => {
      let abs = if dir_path.is_empty() || dir_path == path {
        std::path::PathBuf::from(path)
      } else if Path::new(dir_path).is_absolute() {
        resolve_local_abs(source, dir_path)?
      } else {
        std::path::PathBuf::from(join_path(path, dir_path))
      };

      if !abs.is_dir() {
        return Err("不是目录".into());
      }

      let mut entries = Vec::new();
      for item in std::fs::read_dir(&abs).map_err(|e| format!("读取目录失败: {e}"))? {
        let item = item.map_err(|e| format!("读取目录失败: {e}"))?;
        let meta = match item.metadata() {
          Ok(meta) => meta,
          Err(_) => continue,
        };
        let name = item.file_name().to_string_lossy().to_string();
        entries.push(FileEntry {
          name: name.clone(),
          path: name,
          is_directory: meta.is_dir(),
          size: if meta.is_file() { meta.len() } else { 0 },
          mtime: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        });
      }
      entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
      });
      Ok(entries)
    }
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      let relative = relative_under_source(source, dir_path)?;
      let mut entries = ssh_pool::with_shared(&config, |session| list_remote(session, path, &relative))?;
      for entry in &mut entries {
        entry.path = entry.name.clone();
      }
      Ok(entries)
    }
  }
}

pub fn read_text_source(
  app: &AppHandle,
  source: &SourceConfig,
  file_path: &str,
) -> Result<String, String> {
  match source {
    SourceConfig::Local { .. } => read_text(source, file_path),
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      let relative = relative_under_source(source, file_path)?;
      ssh_pool::with_shared(&config, |session| read_remote_text(session, path, &relative))
    }
  }
}

pub fn write_text_source(
  app: &AppHandle,
  source: &SourceConfig,
  file_path: &str,
  content: &str,
) -> Result<(), String> {
  match source {
    SourceConfig::Local { .. } => write_text(source, file_path, content),
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      let relative = relative_under_source(source, file_path)?;
      ssh_pool::with_shared(&config, |session| {
        write_remote_text(session, path, &relative, content)
      })
    }
  }
}

pub fn rename_source(
  app: &AppHandle,
  source: &SourceConfig,
  old_relative: &str,
  new_name: &str,
) -> Result<(), String> {
  match source {
    SourceConfig::Local { .. } => rename_file(source, old_relative, new_name),
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      ssh_pool::with_shared(&config, |session| {
        rename_remote(session, path, old_relative, new_name)
      })
    }
  }
}

pub fn delete_source(
  app: &AppHandle,
  source: &SourceConfig,
  relative: &str,
  is_directory: bool,
) -> Result<(), String> {
  match source {
    SourceConfig::Local { .. } => delete_file(source, relative, is_directory),
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      ssh_pool::with_shared(&config, |session| {
        delete_remote(session, path, relative, is_directory)
      })
    }
  }
}

#[allow(dead_code)]
pub fn hash_file(
  app: &AppHandle,
  source: &SourceConfig,
  relative: &str,
) -> Result<String, String> {
  match source {
    SourceConfig::Local { path } => {
      let abs = join_path(path, relative);
      file_sha256(Path::new(&abs))
    }
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      ssh_pool::with_shared(&config, |session| remote_sha256(session, path, relative))
    }
  }
}

#[allow(dead_code)]
pub fn quick_hash_file(
  app: &AppHandle,
  source: &SourceConfig,
  relative: &str,
) -> Result<String, String> {
  match source {
    SourceConfig::Local { path } => {
      let abs = join_path(path, relative);
      file_quick_hash(Path::new(&abs))
    }
    SourceConfig::Sftp { config_id, path } => {
      let config = ssh_store::get_internal(app, config_id)?;
      ssh_pool::with_shared(&config, |session| {
        remote_quick_hash(session, path, relative)
      })
    }
  }
}

/// Open sessions once for a compare/sync run when SFTP is involved.
/// SFTP uses an **isolated** (non-pooled) connection for the long-lived session.
pub struct SourceSession<'a> {
  app: &'a AppHandle,
  source: &'a SourceConfig,
  remote: Option<parking_lot::Mutex<PooledConn>>,
}

impl<'a> SourceSession<'a> {
  pub fn open(app: &'a AppHandle, source: &'a SourceConfig) -> Result<Self, String> {
    let remote = match source {
      SourceConfig::Local { .. } => None,
      SourceConfig::Sftp { config_id, .. } => {
        let config = ssh_store::get_internal(app, config_id)?;
        // Isolated: long compare/sync must not share the short-op pool.
        Some(parking_lot::Mutex::new(ssh_pool::connect_isolated(&config)?))
      }
    };
    Ok(Self {
      app,
      source,
      remote,
    })
  }

  fn with_remote<T>(&self, f: impl FnOnce(&PooledConn) -> Result<T, String>) -> Result<T, String> {
    let guard = self
      .remote
      .as_ref()
      .ok_or("SFTP 会话未建立")?
      .lock();
    f(&guard)
  }

  fn with_remote_mut<T>(
    &self,
    f: impl FnOnce(&mut PooledConn) -> Result<T, String>,
  ) -> Result<T, String> {
    let mut guard = self
      .remote
      .as_ref()
      .ok_or("SFTP 会话未建立")?
      .lock();
    f(&mut guard)
  }

  pub fn list(&self, relative: &str) -> Result<Vec<FileEntry>, String> {
    match self.source {
      SourceConfig::Local { path } => list_directory_relative(path, relative),
      SourceConfig::Sftp { path, .. } => {
        self.with_remote(|conn| list_remote(&conn.session, path, relative))
      }
    }
  }

  pub fn hash(&self, relative: &str) -> Result<String, String> {
    match self.source {
      SourceConfig::Local { path } => file_sha256(Path::new(&join_path(path, relative))),
      SourceConfig::Sftp { path, .. } => {
        self.with_remote(|conn| remote_sha256(&conn.session, path, relative))
      }
    }
  }

  pub fn quick_hash(&self, relative: &str) -> Result<String, String> {
    match self.source {
      SourceConfig::Local { path } => file_quick_hash(Path::new(&join_path(path, relative))),
      SourceConfig::Sftp { path, .. } => {
        self.with_remote(|conn| remote_quick_hash(&conn.session, path, relative))
      }
    }
  }

  pub fn read_bytes(&self, relative: &str) -> Result<Vec<u8>, String> {
    match self.source {
      SourceConfig::Local { .. } => {
        let abs = resolve_local_abs(self.source, relative)?;
        std::fs::read(&abs).map_err(|e| format!("读取失败: {e}"))
      }
      SourceConfig::Sftp { path, .. } => {
        self.with_remote(|conn| read_remote_bytes(&conn.session, path, relative))
      }
    }
  }

  pub fn write_bytes(&self, relative: &str, content: &[u8]) -> Result<(), String> {
    match self.source {
      SourceConfig::Local { .. } => {
        let abs = resolve_local_abs(self.source, relative)?;
        if let Some(parent) = abs.parent() {
          std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        std::fs::write(&abs, content).map_err(|e| format!("写入失败: {e}"))
      }
      SourceConfig::Sftp { path, .. } => self.with_remote_mut(|conn| {
        // Prefer cached known_dirs + SFTP for parent mkdir, then write.
        let parent = parent_relative(relative);
        if !parent.is_empty() {
          ensure_remote_dir_on(conn, path, &parent)?;
        }
        write_remote_bytes(&conn.session, path, relative, content)
      }),
    }
  }

  pub fn ensure_dir(&self, relative: &str) -> Result<(), String> {
    match self.source {
      SourceConfig::Local { path } => {
        let abs = if relative.is_empty() {
          std::path::PathBuf::from(path)
        } else {
          std::path::PathBuf::from(join_path(path, relative))
        };
        std::fs::create_dir_all(&abs).map_err(|e| format!("创建目录失败: {e}"))
      }
      SourceConfig::Sftp { path, .. } => {
        self.with_remote_mut(|conn| ensure_remote_dir_on(conn, path, relative))
      }
    }
  }

  #[allow(dead_code)]
  pub fn app(&self) -> &AppHandle {
    self.app
  }
}

pub fn copy_between(
  from: &SourceSession<'_>,
  to: &SourceSession<'_>,
  relative: &str,
) -> Result<(), String> {
  match (from.source, to.source) {
    (SourceConfig::Local { path: from_root }, SourceConfig::Local { path: to_root }) => {
      let src = std::path::PathBuf::from(join_path(from_root, relative));
      let dst = std::path::PathBuf::from(join_path(to_root, relative));
      copy_local_file(&src, &dst)
    }
    _ => {
      let bytes = from.read_bytes(relative)?;
      to.write_bytes(relative, &bytes)
    }
  }
}

fn parent_relative(relative: &str) -> String {
  use crate::path_utils::normalize_relative;
  let normalized = normalize_relative(relative);
  if normalized.is_empty() {
    return String::new();
  }
  let mut parts: Vec<&str> = normalized.split('/').collect();
  if parts.len() <= 1 {
    return String::new();
  }
  parts.pop();
  parts.join("/")
}
