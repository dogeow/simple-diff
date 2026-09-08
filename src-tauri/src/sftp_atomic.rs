//! OpenSSH PROTOCOL sections 4.2/4.3: ssh2 0.9 exposes only standard SFTP rename.
//! https://github.com/openssh/openssh-portable/blob/master/PROTOCOL
use ssh2::Session;
use std::io::{Read, Write};
use std::path::Path;

const EXTENSION: &[u8] = b"posix-rename@openssh.com";
const MAX_PACKET: usize = 256 * 1024;

fn read_packet(input: &mut dyn Read) -> Result<Vec<u8>, String> {
  let mut length = [0u8; 4];
  input.read_exact(&mut length).map_err(|e| e.to_string())?;
  let length = u32::from_be_bytes(length) as usize;
  if length == 0 || length > MAX_PACKET {
    return Err("SFTP 响应长度无效".into());
  }
  let mut packet = vec![0u8; length];
  input.read_exact(&mut packet).map_err(|e| e.to_string())?;
  Ok(packet)
}

fn write_packet(output: &mut dyn Write, packet: &[u8]) -> Result<(), String> {
  if packet.len() > MAX_PACKET {
    return Err("SFTP 请求过大".into());
  }
  output
    .write_all(&(packet.len() as u32).to_be_bytes())
    .map_err(|e| e.to_string())?;
  output.write_all(packet).map_err(|e| e.to_string())?;
  output.flush().map_err(|e| e.to_string())
}

fn append_string(packet: &mut Vec<u8>, value: &[u8]) {
  packet.extend_from_slice(&(value.len() as u32).to_be_bytes());
  packet.extend_from_slice(value);
}

fn take_string<'a>(data: &mut &'a [u8]) -> Result<&'a [u8], String> {
  let header = data.get(..4).ok_or("SFTP 响应不完整")?;
  let length = u32::from_be_bytes(header.try_into().map_err(|_| "SFTP 响应无效")?) as usize;
  let value = data.get(4..4 + length).ok_or("SFTP 字符串长度无效")?;
  *data = &data[4 + length..];
  Ok(value)
}

pub fn rename(session: &Session, source: &Path, target: &Path) -> Result<(), String> {
  let mut channel = session.channel_session().map_err(|e| e.to_string())?;
  channel.subsystem("sftp").map_err(|e| e.to_string())?;
  write_packet(&mut channel, &[1, 0, 0, 0, 3])?;
  let hello = read_packet(&mut channel)?;
  if hello.get(..5) != Some(&[2, 0, 0, 0, 3]) {
    return Err("不支持的 SFTP 协议版本".into());
  }
  let mut extensions = &hello[5..];
  let mut supported = false;
  while !extensions.is_empty() {
    let name = take_string(&mut extensions)?;
    let version = take_string(&mut extensions)?;
    supported |= name == EXTENSION && version == b"1";
  }
  if !supported {
    return Err("服务器不支持原子覆盖扩展，已保留原文件".into());
  }
  let mut request = vec![200, 0, 0, 0, 1];
  append_string(&mut request, EXTENSION);
  append_string(
    &mut request,
    source.to_str().ok_or("无效远程文件名")?.as_bytes(),
  );
  append_string(
    &mut request,
    target.to_str().ok_or("无效远程文件名")?.as_bytes(),
  );
  write_packet(&mut channel, &request)?;
  let response = read_packet(&mut channel)?;
  if response.get(..5) != Some(&[101, 0, 0, 0, 1]) || response.len() < 9 {
    return Err("SFTP 重命名响应无效".into());
  }
  let status = u32::from_be_bytes(response[5..9].try_into().map_err(|_| "SFTP 状态无效")?);
  let _ = channel.send_eof();
  let _ = channel.close();
  if status == 0 {
    Ok(())
  } else {
    Err(format!("远程原子替换失败 (SFTP {status})"))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn rejects_oversized_packets_and_truncated_extensions() {
    assert!(read_packet(&mut &[0xff, 0xff, 0xff, 0xff][..]).is_err());
    assert!(take_string(&mut &[0, 0, 0, 10, 1][..]).is_err());
  }
}
