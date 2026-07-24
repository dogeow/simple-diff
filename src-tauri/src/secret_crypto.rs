use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;
use tauri::{AppHandle, Manager};

const KEY_FILE: &str = "master.key";
const ENC_PREFIX: &str = "enc:v1:";

fn ensure_private_dir(path: &PathBuf) -> Result<(), String> {
  fs::create_dir_all(path).map_err(|e| format!("创建数据目录失败: {e}"))?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
  }
  Ok(())
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
  ensure_private_dir(&dir)?;
  Ok(dir)
}

fn master_key(app: &AppHandle) -> Result<[u8; 32], String> {
  let dir = app_data_dir(app)?;
  let key_path = dir.join(KEY_FILE);
  if key_path.exists() {
    let bytes = fs::read(&key_path).map_err(|e| format!("读取主密钥失败: {e}"))?;
    if bytes.len() != 32 {
      return Err("主密钥损坏".into());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    return Ok(key);
  }

  let mut key = [0u8; 32];
  rand::thread_rng().fill_bytes(&mut key);
  fs::write(&key_path, key).map_err(|e| format!("写入主密钥失败: {e}"))?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600));
  }
  Ok(key)
}

/// Encrypt a secret for disk storage. Empty/None passthrough as None.
pub fn encrypt_secret(app: &AppHandle, value: Option<String>) -> Result<Option<String>, String> {
  let Some(plain) = value.filter(|v| !v.is_empty()) else {
    return Ok(None);
  };
  if plain.starts_with(ENC_PREFIX) {
    return Ok(Some(plain));
  }

  let key = master_key(app)?;
  let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("初始化加密失败: {e}"))?;
  let mut nonce_bytes = [0u8; 12];
  rand::thread_rng().fill_bytes(&mut nonce_bytes);
  let nonce = Nonce::from_slice(&nonce_bytes);
  let ciphertext = cipher
    .encrypt(nonce, plain.as_bytes())
    .map_err(|e| format!("加密失败: {e}"))?;

  let mut packed = Vec::with_capacity(12 + ciphertext.len());
  packed.extend_from_slice(&nonce_bytes);
  packed.extend_from_slice(&ciphertext);
  Ok(Some(format!(
    "{ENC_PREFIX}{}",
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, packed)
  )))
}

pub fn decrypt_secret(app: &AppHandle, value: Option<String>) -> Result<Option<String>, String> {
  let Some(raw) = value.filter(|v| !v.is_empty()) else {
    return Ok(None);
  };
  if !raw.starts_with(ENC_PREFIX) {
    // Legacy plaintext — keep usable, migrate on next save
    return Ok(Some(raw));
  }

  let encoded = &raw[ENC_PREFIX.len()..];
  let packed = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
    .map_err(|e| format!("解密失败: {e}"))?;
  if packed.len() < 13 {
    return Err("密文损坏".into());
  }
  let (nonce_bytes, ciphertext) = packed.split_at(12);
  let key = master_key(app)?;
  let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("初始化解密失败: {e}"))?;
  let nonce = Nonce::from_slice(nonce_bytes);
  let plain = cipher
    .decrypt(nonce, ciphertext)
    .map_err(|_| "解密失败".to_string())?;
  String::from_utf8(plain).map(Some).map_err(|e| format!("解密结果无效: {e}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn roundtrip_without_app_uses_temp_key_logic() {
    // Unit-level: encrypt format prefix
    let plain = "secret-password";
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plain.as_bytes()).unwrap();
    let mut packed = Vec::new();
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    let encoded = format!(
      "{ENC_PREFIX}{}",
      base64::Engine::encode(&base64::engine::general_purpose::STANDARD, packed)
    );
    assert!(encoded.starts_with(ENC_PREFIX));

    let packed2 = base64::Engine::decode(
      &base64::engine::general_purpose::STANDARD,
      &encoded[ENC_PREFIX.len()..],
    )
    .unwrap();
    let (n, c) = packed2.split_at(12);
    let plain2 = cipher.decrypt(Nonce::from_slice(n), c).unwrap();
    assert_eq!(String::from_utf8(plain2).unwrap(), plain);
  }
}
