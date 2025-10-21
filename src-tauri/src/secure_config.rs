use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SecureOrgWhitelistEntry {
    pub id: Option<String>,
    pub org_id: String,
    pub org_name: String,
    #[serde(default)]
    pub added_at: Option<String>,
    #[serde(default)]
    pub added_by: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SecureConfig {
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub org_whitelist: Vec<SecureOrgWhitelistEntry>,
    #[serde(default)]
    pub admin_password_hash: Option<String>,
    #[serde(default)]
    pub signature: Option<String>,
}

fn config_file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let resolver = app.path();
    let config_dir = resolver.app_config_dir().ok()?;
    Some(config_dir.join("config.pkg"))
}

fn read_secure_config(app: &tauri::AppHandle) -> Result<Option<SecureConfig>, String> {
    let path = match config_file_path(app) {
        Some(path) => path,
        None => return Err("アプリの設定ディレクトリを取得できませんでした".to_string()),
    };

    if !path.exists() {
        return Ok(None);
    }

    let data = fs::read(&path)
        .map_err(|err| format!("config.pkg の読み込みに失敗しました: {}", err))?;

    let config: SecureConfig = serde_json::from_slice(&data)
        .map_err(|err| format!("config.pkg の解析に失敗しました: {}", err))?;

    Ok(Some(config))
}

#[tauri::command]
pub fn load_secure_config(app: tauri::AppHandle) -> Result<Option<SecureConfig>, String> {
    let path = config_file_path(&app);
    if let Some(path) = &path {
        log::info!("Loading secure config from {:?}", path);
    }

    read_secure_config(&app)
}
