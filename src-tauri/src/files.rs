use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use sha2::{Digest, Sha256};

use crate::path_utils::{join_path, normalize_relative};
use crate::types::{FileEntry, SourceConfig};

pub fn resolve_local_abs(source: &SourceConfig, relative_or_abs: &str) -> Result<PathBuf, String> {
  let root = source.as_local_path()?;
  let root = PathBuf::from(root).canonicalize().map_err(|e| format!("无法解析路径: {e}"))?;

  let candidate = if Path::new(relative_or_abs).is_absolute() {
    PathBuf::from(relative_or_abs)
  } else {
    root.join(relative_or_abs)
  };

  let resolved = if candidate.exists() {
    candidate.canonicalize().map_err(|e| format!("无法解析路径: {e}"))?
  } else {
    // Allow writing new files under root: canonicalize parent + append name
    let parent = candidate
      .parent()
      .ok_or_else(|| "无效路径".to_string())?
      .canonicalize()
      .map_err(|e| format!("无法解析路径: {e}"))?;
    let name = candidate
      .file_name()
      .ok_or_else(|| "无效路径".to_string())?;
    parent.join(name)
  };

  if !resolved.starts_with(&root) {
    return Err("文件路径超出允许范围".into());
  }

  Ok(resolved)
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

#[allow(dead_code)]
pub fn list_directory(source: &SourceConfig, dir_path: &str) -> Result<Vec<FileEntry>, String> {
  let abs = resolve_local_abs(source, dir_path)?;
  if !abs.is_dir() {
    return Err("不是目录".into());
  }

  let root = PathBuf::from(source.as_local_path()?);
  let mut entries = Vec::new();

  for item in fs::read_dir(&abs).map_err(|e| format!("读取目录失败: {e}"))? {
    let item = item.map_err(|e| format!("读取目录失败: {e}"))?;
    let meta = item.metadata().map_err(|e| format!("读取元数据失败: {e}"))?;
    let name = item.file_name().to_string_lossy().to_string();
    let full = item.path();
    let relative = full
      .strip_prefix(&root)
      .unwrap_or(&full)
      .to_string_lossy()
      .replace('\\', "/");

    entries.push(FileEntry {
      name,
      path: relative,
      is_directory: meta.is_dir(),
      size: if meta.is_file() { meta.len() } else { 0 },
      mtime: mtime_ms(&meta),
    });
  }

  entries.sort_by(|a, b| {
    match (a.is_directory, b.is_directory) {
      (true, false) => std::cmp::Ordering::Less,
      (false, true) => std::cmp::Ordering::Greater,
      _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    }
  });

  Ok(entries)
}

pub fn list_directory_relative(
  root: &str,
  relative: &str,
) -> Result<Vec<FileEntry>, String> {
  let abs = if relative.is_empty() {
    PathBuf::from(root)
  } else {
    PathBuf::from(join_path(root, relative))
  };

  if !abs.is_dir() {
    return Ok(Vec::new());
  }

  let mut entries = Vec::new();
  for item in fs::read_dir(&abs).map_err(|e| format!("读取目录失败: {e}"))? {
    let item = item.map_err(|e| format!("读取目录失败: {e}"))?;
    let meta = match item.metadata() {
      Ok(meta) => meta,
      Err(_) => continue,
    };
    let name = item.file_name().to_string_lossy().to_string();
    let path = if relative.is_empty() {
      name.clone()
    } else {
      format!("{relative}/{name}")
    };

    entries.push(FileEntry {
      name,
      path: normalize_relative(&path),
      is_directory: meta.is_dir(),
      size: if meta.is_file() { meta.len() } else { 0 },
      mtime: mtime_ms(&meta),
    });
  }

  Ok(entries)
}

pub fn read_text(source: &SourceConfig, file_path: &str) -> Result<String, String> {
  let abs = resolve_local_abs(source, file_path)?;
  let file = fs::File::open(&abs).map_err(|e| format!("读取文件失败: {e}"))?;
  read_text_limited(file)
}

pub const MAX_TEXT_BYTES: u64 = 32 * 1024 * 1024;

pub fn read_text_limited(reader: impl std::io::Read) -> Result<String, String> {
  use std::io::Read;
  let mut bytes = Vec::new();
  reader.take(MAX_TEXT_BYTES + 1).read_to_end(&mut bytes).map_err(|e| format!("读取文件失败: {e}"))?;
  if bytes.len() as u64 > MAX_TEXT_BYTES { return Err("文本预览仅支持 32 MB 以内的文件；大文件仍可进行目录对比和同步。".into()); }
  String::from_utf8(bytes).map_err(|e| format!("文件不是有效 UTF-8: {e}"))
}

pub fn write_text(source: &SourceConfig, file_path: &str, content: &str) -> Result<(), String> {
  let abs = resolve_local_abs(source, file_path)?;
  if let Some(parent) = abs.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
  }
  crate::atomic_file::replace_from_reader(&abs, &mut content.as_bytes()).map(|_| ())
}

pub fn rename_file(source: &SourceConfig, old_relative: &str, new_name: &str) -> Result<(), String> {
  if old_relative.is_empty() {
    return Err("无法重命名根目录".into());
  }
  if new_name.contains('/') || new_name.contains('\\') || new_name == ".." || new_name.is_empty() {
    return Err("非法文件名".into());
  }

  let old_path = resolve_local_abs(source, old_relative)?;
  let parent_rel = {
    let parts: Vec<&str> = old_relative.split(['/', '\\']).filter(|p| !p.is_empty()).collect();
    if parts.len() <= 1 {
      String::new()
    } else {
      parts[..parts.len() - 1].join("/")
    }
  };
  let new_rel = if parent_rel.is_empty() {
    new_name.to_string()
  } else {
    format!("{parent_rel}/{new_name}")
  };
  let new_path = resolve_local_abs(source, &new_rel)?;
  fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {e}"))
}

pub fn delete_file(source: &SourceConfig, relative: &str, is_directory: bool) -> Result<(), String> {
  if relative.is_empty() {
    return Err("不允许删除根目录".into());
  }
  let abs = resolve_local_abs(source, relative)?;
  if is_directory {
    fs::remove_dir_all(&abs).map_err(|e| format!("删除失败: {e}"))
  } else {
    fs::remove_file(&abs).map_err(|e| format!("删除失败: {e}"))
  }
}

pub fn file_sha256(path: &Path) -> Result<String, String> {
  use std::io::Read;

  let mut file = fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 64 * 1024];
  loop {
    let read = file.read(&mut buf).map_err(|e| format!("读取文件失败: {e}"))?;
    if read == 0 {
      break;
    }
    hasher.update(&buf[..read]);
  }
  Ok(hex::encode(hasher.finalize()))
}

pub fn file_quick_hash(path: &Path) -> Result<String, String> {
  use std::io::{Read, Seek, SeekFrom};

  let meta = fs::metadata(path).map_err(|e| format!("读取元数据失败: {e}"))?;
  let size = meta.len();
  let mut file = fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
  const CHUNK: usize = 64 * 1024;
  let mut buf = vec![0u8; CHUNK];

  // Small files: whole-file hash (matches Electron quick_hash semantics).
  if size <= CHUNK as u64 {
    let mut hasher = Sha256::new();
    loop {
      let n = file.read(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
      if n == 0 {
        break;
      }
      hasher.update(&buf[..n]);
    }
    return Ok(hex::encode(hasher.finalize()));
  }

  let head_read = file.read(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
  let mut head_hasher = Sha256::new();
  head_hasher.update(&buf[..head_read]);
  let head_hash = hex::encode(head_hasher.finalize());

  let mut tail_hasher = Sha256::new();
  let seek_pos = size.saturating_sub(CHUNK as u64);
  file
    .seek(SeekFrom::Start(seek_pos))
    .map_err(|e| format!("定位失败: {e}"))?;
  let tail_read = file.read(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
  tail_hasher.update(&buf[..tail_read]);
  let tail_hash = hex::encode(tail_hasher.finalize());

  Ok(format!("{head_hash}:{tail_hash}"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;

  #[test]
  fn quick_hash_small_file_is_single_digest() {
    let dir = std::env::temp_dir().join(format!("simple-diff-qh-{}", std::process::id()));
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("small.txt");
    let mut f = fs::File::create(&path).unwrap();
    write!(f, "hello").unwrap();
    let hash = file_quick_hash(&path).unwrap();
    assert!(!hash.contains(':'), "small file should be whole-file hash, got {hash}");
    let _ = fs::remove_dir_all(&dir);
  }
}

