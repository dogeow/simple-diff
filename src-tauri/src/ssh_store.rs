use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;
use uuid::Uuid;

use crate::secret_crypto::{self, app_data_dir};
use crate::types::{SshConfig, SshConfigInput, SshConfigInternal};

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_data_dir(app)?.join("ssh-configs.json"))
}

fn read_all(app: &AppHandle) -> Result<Vec<SshConfigInternal>, String> {
  let path = store_path(app)?;
  if !path.exists() {
    return Ok(Vec::new());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取 SSH 配置失败: {e}"))?;
  serde_json::from_str(&raw).map_err(|e| format!("解析 SSH 配置失败: {e}"))
}

fn write_all(app: &AppHandle, configs: &[SshConfigInternal]) -> Result<(), String> {
  let path = store_path(app)?;
  let raw = serde_json::to_string_pretty(configs).map_err(|e| format!("序列化 SSH 配置失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入 SSH 配置失败: {e}"))?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
  }
  Ok(())
}

fn to_public(config: &SshConfigInternal) -> SshConfig {
  SshConfig {
    id: config.id.clone(),
    label: config.label.clone(),
    host: config.host.clone(),
    port: config.port,
    username: config.username.clone(),
    auth_type: config.auth_type.clone(),
    default_path: config.default_path.clone(),
  }
}

pub fn list_configs(app: &AppHandle) -> Result<Vec<SshConfig>, String> {
  Ok(read_all(app)?.iter().map(to_public).collect())
}

pub fn get_internal(app: &AppHandle, id: &str) -> Result<SshConfigInternal, String> {
  let config = read_all(app)?
    .into_iter()
    .find(|c| c.id == id)
    .ok_or_else(|| "SSH 配置未找到".to_string())?;
  Ok(SshConfigInternal {
    password: secret_crypto::decrypt_secret(app, config.password)?,
    passphrase: secret_crypto::decrypt_secret(app, config.passphrase)?,
    ..config
  })
}

pub fn save_config(app: &AppHandle, input: SshConfigInput) -> Result<SshConfig, String> {
  let mut configs = read_all(app)?;
  let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
  let host = input.host.trim().to_string();
  if host.is_empty() {
    return Err("主机不能为空".into());
  }
  let label = {
    let trimmed = input.label.trim();
    if trimmed.is_empty() {
      host.clone()
    } else {
      trimmed.to_string()
    }
  };
  let username = {
    let trimmed = input.username.trim();
    if trimmed.is_empty() {
      "root".to_string()
    } else {
      trimmed.to_string()
    }
  };

  let existing = configs.iter().find(|c| c.id == id);
  let password = if input.password.is_some() {
    secret_crypto::encrypt_secret(app, input.password)?
  } else {
    existing.and_then(|c| c.password.clone())
  };
  let private_key_path = input
    .private_key_path
    .or_else(|| existing.and_then(|c| c.private_key_path.clone()));
  let passphrase = if input.passphrase.is_some() {
    secret_crypto::encrypt_secret(app, input.passphrase)?
  } else {
    existing.and_then(|c| c.passphrase.clone())
  };

  let record = SshConfigInternal {
    id: id.clone(),
    label,
    host,
    port: if input.port == 0 { 22 } else { input.port },
    username,
    auth_type: input.auth_type,
    default_path: input.default_path,
    password,
    private_key_path,
    passphrase,
  };

  if let Some(idx) = configs.iter().position(|c| c.id == id) {
    configs[idx] = record.clone();
  } else {
    configs.push(record.clone());
  }
  write_all(app, &configs)?;
  Ok(to_public(&record))
}

pub fn delete_config(app: &AppHandle, id: &str) -> Result<(), String> {
  let mut configs = read_all(app)?;
  configs.retain(|c| c.id != id);
  write_all(app, &configs)
}

pub fn label_for(app: &AppHandle, config_id: &str) -> Option<String> {
  list_configs(app)
    .ok()
    .and_then(|configs| configs.into_iter().find(|c| c.id == config_id).map(|c| c.label))
}
