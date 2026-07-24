use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::compare::{compare_directories, CompareCallbacks};
use crate::files::{delete_file, list_directory, read_text, rename_file, resolve_local_abs, write_text};
use crate::state::{ActiveCompare, AppState};
use crate::types::{
  CompareLocalWatchRequest, ComparePartialRequest, CompareRequest, CompareResult, FileEntry,
  IpcResult, SourceConfig,
};

#[tauri::command]
pub fn list_files(source: SourceConfig, dir_path: String) -> IpcResult<Vec<FileEntry>> {
  match list_directory(&source, &dir_path) {
    Ok(entries) => IpcResult::ok(entries),
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub fn read_text_file(source: SourceConfig, file_path: String) -> IpcResult<String> {
  match read_text(&source, &file_path) {
    Ok(content) => IpcResult::ok(content),
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub fn write_text_file(source: SourceConfig, file_path: String, content: String) -> IpcResult<()> {
  match write_text(&source, &file_path, &content) {
    Ok(()) => IpcResult::ok_empty(),
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub async fn run_compare(
  app: AppHandle,
  state: State<'_, AppState>,
  request: CompareRequest,
) -> Result<IpcResult<CompareResult>, String> {
  state.cancel_compare(Some(&request.compare_id));

  let cancelled = Arc::new(AtomicBool::new(false));
  state.active_compares.lock().insert(
    request.compare_id.clone(),
    ActiveCompare {
      cancelled: cancelled.clone(),
    },
  );

  let compare_id = request.compare_id.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    let callbacks = CompareCallbacks {
      app: &app,
      compare_id: &request.compare_id,
      cancelled: cancelled.clone(),
    };

    compare_directories(
      &request.left,
      &request.right,
      &[],
      &request.strategies,
      request.extension_filter.as_deref(),
      request.previous_entries.as_deref(),
      false,
      Some(&callbacks),
    )
  })
  .await
  .map_err(|err| format!("对比任务失败: {err}"))?;

  state.active_compares.lock().remove(&compare_id);

  Ok(match result {
    Ok(value) => IpcResult::ok(value),
    Err(err) => IpcResult::err(err),
  })
}

#[tauri::command]
pub async fn run_partial_compare(request: ComparePartialRequest) -> Result<IpcResult<CompareResult>, String> {
  let result = tauri::async_runtime::spawn_blocking(move || {
    compare_directories(
      &request.left,
      &request.right,
      &request.relative_roots,
      &request.strategies,
      request.extension_filter.as_deref(),
      request.previous_entries.as_deref(),
      true,
      None,
    )
  })
  .await
  .map_err(|err| format!("局部对比失败: {err}"))?;

  Ok(match result {
    Ok(value) => IpcResult::ok(value),
    Err(err) => IpcResult::err(err),
  })
}

#[tauri::command]
pub fn cancel_compare(state: State<'_, AppState>, compare_id: Option<String>) -> IpcResult<()> {
  state.cancel_compare(compare_id.as_deref());
  IpcResult::ok_empty()
}

#[tauri::command]
pub fn start_local_compare_watch(
  app: AppHandle,
  state: State<'_, AppState>,
  request: CompareLocalWatchRequest,
) -> IpcResult<()> {
  match state
    .watch_manager
    .start(app, request.session_id, request.left, request.right)
  {
    Ok(()) => IpcResult::ok_empty(),
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub fn stop_local_compare_watch(
  state: State<'_, AppState>,
  session_id: Option<String>,
) -> IpcResult<()> {
  state.watch_manager.stop(session_id.as_deref());
  IpcResult::ok_empty()
}

#[tauri::command]
pub async fn select_folder(app: AppHandle) -> Result<IpcResult<Option<String>>, String> {
  let path = tauri::async_runtime::spawn_blocking(move || {
    app.dialog()
      .file()
      .blocking_pick_folder()
      .map(|path| path.to_string())
  })
  .await
  .map_err(|err| format!("选择目录失败: {err}"))?;

  Ok(IpcResult::ok(path))
}

#[tauri::command]
pub async fn select_file(app: AppHandle) -> Result<IpcResult<Option<String>>, String> {
  let path = tauri::async_runtime::spawn_blocking(move || {
    app.dialog()
      .file()
      .blocking_pick_file()
      .map(|path| path.to_string())
  })
  .await
  .map_err(|err| format!("选择文件失败: {err}"))?;

  Ok(IpcResult::ok(path))
}

#[tauri::command]
pub fn show_in_folder(app: AppHandle, source: SourceConfig, relative_path: String) -> IpcResult<()> {
  match resolve_local_abs(&source, &relative_path) {
    Ok(path) => match app.opener().reveal_item_in_dir(path) {
      Ok(()) => IpcResult::ok_empty(),
      Err(err) => IpcResult::err(format!("打开失败: {err}")),
    },
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub fn rename_path(
  source: SourceConfig,
  old_relative_path: String,
  new_name: String,
) -> IpcResult<()> {
  match rename_file(&source, &old_relative_path, &new_name) {
    Ok(()) => IpcResult::ok_empty(),
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub fn delete_path(
  source: SourceConfig,
  relative_path: String,
  is_directory: bool,
) -> IpcResult<()> {
  match delete_file(&source, &relative_path, is_directory) {
    Ok(()) => IpcResult::ok_empty(),
    Err(err) => IpcResult::err(err),
  }
}

#[tauri::command]
pub fn write_log(message: String) {
  log::info!("[renderer] {message}");
}
