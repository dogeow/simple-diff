mod commands;
mod compare;
mod files;
mod history;
mod log_bridge;
mod path_guards;
mod path_utils;
mod secret_crypto;
mod source_ops;
mod ssh;
mod ssh_pool;
mod ssh_store;
mod state;
mod sync;
mod sync_plan;
mod types;
mod watch;

use state::AppState;
use tauri::{Emitter, Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let open_paths: Vec<String> = std::env::args()
    .skip(1)
    .filter(|arg| !arg.starts_with('-'))
    .collect();

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(AppState::new())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      crate::sync::sync_manager().hydrate_from_disk(app.handle());
      let _ = crate::secret_crypto::app_data_dir(app.handle());
      app.manage(open_paths);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::list_files,
      commands::read_text_file,
      commands::write_text_file,
      commands::run_compare,
      commands::run_partial_compare,
      commands::cancel_compare,
      commands::start_local_compare_watch,
      commands::stop_local_compare_watch,
      commands::select_folder,
      commands::select_file,
      commands::show_in_folder,
      commands::rename_path,
      commands::delete_path,
      commands::write_log,
      commands::history_list,
      commands::history_clear,
      commands::history_delete,
      commands::sync_start,
      commands::sync_pause,
      commands::sync_resume,
      commands::sync_get_status,
      commands::sync_clear,
      commands::ssh_list_configs,
      commands::ssh_save_config,
      commands::ssh_delete_config,
      commands::ssh_test,
      commands::ssh_browse,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::Ready = event {
        if let Some(paths) = app_handle.try_state::<Vec<String>>() {
          if !paths.is_empty() {
            let _ = app_handle.emit("app:open-paths", paths.inner().clone());
          }
        }
      }
    });
}
