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
    pub features: Option<SecureFeatureRestrictions>,
    #[serde(default)]
    pub signature: Option<String>,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecureConfigResult {
    pub config: Option<SecureConfig>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecureFeatureRestrictions {
    #[serde(default)]
    pub allow_web_search: Option<bool>,
    #[serde(default)]
    pub allow_vector_store: Option<bool>,
    #[serde(default)]
    pub allow_file_upload: Option<bool>,
    #[serde(default)]
    pub allow_chat_file_attachment: Option<bool>,
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
pub fn load_secure_config(app: tauri::AppHandle) -> Result<SecureConfigResult, String> {
    let maybe_path = config_file_path(&app);
    if let Some(path) = &maybe_path {
        log::info!("Loading secure config from {:?}", path);
    }

    let config = match read_secure_config(&app) {
        Ok(value) => value,
        Err(err) => return Err(err),
    };

    let path_string = maybe_path.map(|p| p.display().to_string());

    Ok(SecureConfigResult {
        config,
        path: path_string,
    })
}
