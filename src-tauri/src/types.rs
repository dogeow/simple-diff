use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
  pub name: String,
  pub path: String,
  pub is_directory: bool,
  pub size: u64,
  pub mtime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SourceConfig {
  #[serde(rename = "local")]
  Local { path: String },
  #[serde(rename = "sftp")]
  Sftp {
    #[serde(rename = "configId")]
    config_id: String,
    path: String,
  },
}

impl SourceConfig {
  pub fn local_path(&self) -> Result<&str, String> {
    match self {
      Self::Local { path } => Ok(path),
      Self::Sftp { .. } => Err("当前 Tauri 版本暂不支持 SFTP".into()),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CompareState {
  Pending,
  Comparing,
  Equal,
  LeftOnly,
  RightOnly,
  Different,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DiffReason {
  Size {
    #[serde(rename = "leftSize")]
    left_size: u64,
    #[serde(rename = "rightSize")]
    right_size: u64,
  },
  Mtime {
    #[serde(rename = "leftMtime")]
    left_mtime: u64,
    #[serde(rename = "rightMtime")]
    right_mtime: u64,
  },
  Hash {
    #[serde(rename = "leftHash")]
    left_hash: String,
    #[serde(rename = "rightHash")]
    right_hash: String,
  },
  QuickHash {
    #[serde(rename = "leftHash")]
    left_hash: String,
    #[serde(rename = "rightHash")]
    right_hash: String,
  },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrategyName {
  Size,
  Mtime,
  Hash,
  QuickHash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareEntry {
  pub relative_path: String,
  pub name: String,
  pub is_directory: bool,
  pub state: CompareState,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub left: Option<FileEntry>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub right: Option<FileEntry>,
  pub reasons: Vec<DiffReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareFileFingerprint {
  pub is_directory: bool,
  pub size: u64,
  pub mtime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareCacheEntry {
  pub relative_path: String,
  pub state: CompareState,
  pub left: CompareFileFingerprint,
  pub right: CompareFileFingerprint,
  pub reasons: Vec<DiffReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareRequest {
  pub compare_id: String,
  pub left: SourceConfig,
  pub right: SourceConfig,
  pub strategies: Vec<StrategyName>,
  pub extension_filter: Option<Vec<String>>,
  pub previous_entries: Option<Vec<CompareCacheEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparePartialRequest {
  pub left: SourceConfig,
  pub right: SourceConfig,
  pub relative_roots: Vec<String>,
  pub strategies: Vec<StrategyName>,
  pub extension_filter: Option<Vec<String>>,
  pub previous_entries: Option<Vec<CompareCacheEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareLocalWatchRequest {
  pub session_id: String,
  pub left: SourceConfig,
  pub right: SourceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompareStats {
  pub total: u64,
  pub equal: u64,
  pub different: u64,
  pub left_only: u64,
  pub right_only: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareResult {
  pub entries: Vec<CompareEntry>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub entries_included: Option<bool>,
  pub stats: CompareStats,
  pub duration: u64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub left_source: Option<SourceConfig>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub right_source: Option<SourceConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResult<T> {
  pub success: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<T>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl<T> IpcResult<T> {
  pub fn ok(data: T) -> Self {
    Self {
      success: true,
      data: Some(data),
      error: None,
    }
  }

  pub fn err(message: impl Into<String>) -> Self {
    Self {
      success: false,
      data: None,
      error: Some(message.into()),
    }
  }
}

impl IpcResult<()> {
  pub fn ok_empty() -> Self {
    Self {
      success: true,
      data: None,
      error: None,
    }
  }
}
