mod openai_proxy;

use openai_proxy::{make_openai_request, OpenAIRequest, OpenAIResponse};

#[tauri::command]
async fn proxy_openai_request(request: OpenAIRequest) -> Result<OpenAIResponse, String> {
    make_openai_request(request).await
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
    .invoke_handler(tauri::generate_handler![proxy_openai_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
