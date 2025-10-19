mod openai_proxy;

use openai_proxy::{make_openai_request, upload_file_to_openai, OpenAIRequest, FileUploadRequest, OpenAIResponse};

#[tauri::command]
async fn proxy_openai_request(request: OpenAIRequest) -> Result<OpenAIResponse, String> {
    make_openai_request(request).await
}

#[tauri::command]
async fn proxy_file_upload(request: FileUploadRequest) -> Result<OpenAIResponse, String> {
    upload_file_to_openai(request).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // 開発環境と本番環境の両方でログを有効化
      let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Info
      } else {
        log::LevelFilter::Info // 本番環境でもInfoレベルのログを出力
      };

      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log_level)
          .build(),
      )?;

      log::info!("Application started");
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![proxy_openai_request, proxy_file_upload])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
