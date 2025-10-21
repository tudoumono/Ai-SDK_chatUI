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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SecureConfigSearchPath {
    pub path: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecureConfigResult {
    pub config: Option<SecureConfig>,
    pub path: Option<String>,
    #[serde(default)]
    pub searched_paths: Vec<SecureConfigSearchPath>,
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

fn candidate_paths(app: &tauri::AppHandle) -> Vec<(PathBuf, String)> {
    let resolver = app.path();
    let mut paths: Vec<(PathBuf, String)> = Vec::new();

    if let Ok(config_dir) = resolver.app_config_dir() {
        paths.push((
            config_dir.join("config.pkg"),
            "アプリの設定フォルダ（自動コピー先）".to_string(),
        ));
    }

    if let Ok(exe_dir) = resolver.executable_dir() {
        let candidate = exe_dir.join("config.pkg");
        if !paths.iter().any(|(existing, _)| existing == &candidate) {
            paths.push((candidate, "アプリを起動したフォルダ".to_string()));
        }
    }

    if let Ok(resource_dir) = resolver.resource_dir() {
        let candidate = resource_dir.join("config.pkg");
        if !paths.iter().any(|(existing, _)| existing == &candidate) {
            paths.push((candidate, "アプリのリソースフォルダ".to_string()));
        }
    }

    paths
}

#[tauri::command]
pub fn load_secure_config(app: tauri::AppHandle) -> Result<SecureConfigResult, String> {
    let candidates = candidate_paths(&app);

    for (path, _) in candidates.iter() {
        if !path.exists() {
            continue;
        }

        log::info!("Loading secure config from {:?}", path);

        let data = fs::read(path).map_err(|err| {
            format!(
                "config.pkg の読み込みに失敗しました ({}): {}",
                path.display(),
                err
            )
        })?;

        let config: SecureConfig = serde_json::from_slice(&data).map_err(|err| {
            format!(
                "config.pkg の解析に失敗しました ({}): {}",
                path.display(),
                err
            )
        })?;

        let searched_paths = candidates
            .iter()
            .map(|(candidate_path, label)| SecureConfigSearchPath {
                path: candidate_path.display().to_string(),
                label: label.clone(),
            })
            .collect();

        return Ok(SecureConfigResult {
            config: Some(config),
            path: Some(path.display().to_string()),
            searched_paths,
        });
    }

    let searched_paths = candidates
        .iter()
        .map(|(candidate_path, label)| SecureConfigSearchPath {
            path: candidate_path.display().to_string(),
            label: label.clone(),
        })
        .collect();

    Ok(SecureConfigResult {
        config: None,
        path: None,
        searched_paths,
    })
}
