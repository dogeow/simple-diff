mod commands;
mod compare;
mod files;
mod path_utils;
mod state;
mod types;
mod watch;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(AppState::new())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
