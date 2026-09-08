use base64::Engine;
use sha2::{Digest, Sha256};
use ssh2::{CheckResult, KnownHostFileKind, Session};
use std::path::Path;

pub fn verify(
  session: &Session,
  host: &str,
  port: u16,
  known_hosts_path: &Path,
) -> Result<(), String> {
  let (key, _) = session.host_key().ok_or("SSH 服务器未提供主机密钥")?;
  let fingerprint = base64::engine::general_purpose::STANDARD_NO_PAD.encode(Sha256::digest(key));
  let mut known = session
    .known_hosts()
    .map_err(|e| format!("读取 SSH 信任记录失败: {e}"))?;
  if known_hosts_path.exists() {
    known
      .read_file(known_hosts_path, KnownHostFileKind::OpenSSH)
      .map_err(|e| format!("读取 known_hosts 失败: {e}"))?;
  }
  match known.check_port(host, port, key) {
    CheckResult::Match => Ok(()),
    CheckResult::Mismatch => Err(format!("SSH 主机密钥不匹配 ({host}:{port})，已在认证前拒绝连接。服务器指纹 SHA256:{fingerprint}")),
    CheckResult::NotFound => Err(format!("尚未信任 SSH 主机 {host}:{port}（SHA256:{fingerprint}）。请先通过 SSH 核验服务器指纹并将其保存到 {}。", known_hosts_path.display())),
    CheckResult::Failure => Err("SSH 主机密钥校验失败，已拒绝连接".into()),
  }
}
