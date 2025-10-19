use reqwest::{Client, Proxy, multipart};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIRequest {
    pub base_url: String,
    pub api_key: String,
    pub method: String,
    pub path: String,
    pub body: Option<serde_json::Value>,
    pub additional_headers: Option<HashMap<String, String>>,
    pub proxy_config: Option<ProxyConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileUploadRequest {
    pub base_url: String,
    pub api_key: String,
    pub file_data: String, // Base64 encoded file data
    pub file_name: String,
    pub purpose: String,
    pub additional_headers: Option<HashMap<String, String>>,
    pub proxy_config: Option<ProxyConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

pub async fn make_openai_request(request: OpenAIRequest) -> Result<OpenAIResponse, String> {
    // リクエストIDを生成
    let request_id = Uuid::new_v4();
    let start_time = Instant::now();

    log::info!("[Request {}] Starting new request", request_id);

    // クライアントビルダーを作成
    let mut client_builder = Client::builder();

    // プロキシ設定があれば適用
    let mut proxy_info = String::new();
    if let Some(proxy_config) = &request.proxy_config {
        if let Some(http_proxy) = &proxy_config.http_proxy {
            if !http_proxy.is_empty() {
                log::info!("[Request {}] Setting HTTP proxy: {}", request_id, http_proxy);
                proxy_info.push_str(&format!("HTTP Proxy: {}, ", http_proxy));
                let proxy = Proxy::http(http_proxy)
                    .map_err(|e| {
                        let err_msg = format!("[Request {}] HTTP proxy configuration error: {} (Proxy: {})", request_id, e, http_proxy);
                        log::error!("{}", err_msg);
                        err_msg
                    })?;
                client_builder = client_builder.proxy(proxy);
            }
        }
        if let Some(https_proxy) = &proxy_config.https_proxy {
            if !https_proxy.is_empty() {
                log::info!("[Request {}] Setting HTTPS proxy: {}", request_id, https_proxy);
                proxy_info.push_str(&format!("HTTPS Proxy: {}", https_proxy));
                let proxy = Proxy::https(https_proxy)
                    .map_err(|e| {
                        let err_msg = format!("[Request {}] HTTPS proxy configuration error: {} (Proxy: {})", request_id, e, https_proxy);
                        log::error!("{}", err_msg);
                        err_msg
                    })?;
                client_builder = client_builder.proxy(proxy);
            }
        }
    }

    if !proxy_info.is_empty() {
        log::info!("[Request {}] Proxy configuration applied: {}", request_id, proxy_info);
    } else {
        log::info!("[Request {}] No proxy configuration, connecting directly", request_id);
    }

    let client = client_builder
        .build()
        .map_err(|e| {
            let err_msg = format!("[Request {}] Failed to build HTTP client: {}", request_id, e);
            log::error!("{}", err_msg);
            err_msg
        })?;

    // URLを構築
    let base_url = request.base_url.trim_end_matches('/');
    let path = request.path.trim_start_matches('/');
    let url = format!("{}/{}", base_url, path);

    // APIキーをマスクしてログ出力
    let masked_api_key = if request.api_key.len() > 8 {
        format!("{}...{}", &request.api_key[..4], &request.api_key[request.api_key.len()-4..])
    } else {
        "****".to_string()
    };

    // 追加ヘッダーの数を記録
    let custom_headers_count = request.additional_headers.as_ref().map_or(0, |h| h.len());

    // ボディサイズを計算
    let body_size = request.body.as_ref().map_or(0, |b| {
        serde_json::to_string(b).map(|s| s.len()).unwrap_or(0)
    });

    log::info!(
        "[Request {}] {} {} | API Key: {} | Custom Headers: {} | Body Size: {} bytes",
        request_id, request.method, url, masked_api_key, custom_headers_count, body_size
    );

    // リクエストビルダーを作成
    let mut req_builder = match request.method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };

    // Authorization ヘッダーを設定
    req_builder = req_builder.header("Authorization", format!("Bearer {}", request.api_key));

    // 追加ヘッダーを設定
    if let Some(headers) = &request.additional_headers {
        for (key, value) in headers {
            req_builder = req_builder.header(key, value);
        }
    }

    // Content-Type ヘッダーを設定（JSONの場合）
    if request.body.is_some() {
        req_builder = req_builder.header("Content-Type", "application/json");
    }

    // ボディを設定
    if let Some(body) = &request.body {
        req_builder = req_builder.json(body);
    }

    // リクエストを送信
    log::info!("[Request {}] Sending request...", request_id);
    let send_start = Instant::now();
    let response = req_builder
        .send()
        .await
        .map_err(|e| {
            let elapsed = send_start.elapsed();

            // エラー種別を詳細に分類
            let err_msg = if e.is_connect() {
                if e.to_string().contains("dns") || e.to_string().contains("resolve") {
                    format!("[Request {}] DNS resolution failed: {} (Check domain name or DNS settings)", request_id, e)
                } else if e.to_string().contains("certificate") || e.to_string().contains("ssl") || e.to_string().contains("tls") {
                    format!("[Request {}] SSL/TLS error: {} (Check certificate validity or security settings)", request_id, e)
                } else if e.to_string().contains("407") || e.to_string().contains("Proxy Authentication") {
                    format!("[Request {}] Proxy authentication required: {} (Check proxy credentials)", request_id, e)
                } else {
                    format!("[Request {}] Connection failed: {} (Check network/proxy settings)", request_id, e)
                }
            } else if e.is_timeout() {
                format!("[Request {}] Request timeout after {:?}: {}", request_id, elapsed, e)
            } else if e.is_request() {
                format!("[Request {}] Request error: {}", request_id, e)
            } else if e.is_decode() {
                format!("[Request {}] Response decode error: {}", request_id, e)
            } else {
                format!("[Request {}] Failed to send request: {}", request_id, e)
            };
            log::error!("{}", err_msg);
            log::error!("[Request {}] Request failed after {:?}", request_id, elapsed);

            // プロキシが設定されている場合は追加情報を出力
            if !proxy_info.is_empty() {
                log::error!("[Request {}] Active proxy configuration: {}", request_id, proxy_info);
            }

            err_msg
        })?;

    // ステータスコードを取得
    let status = response.status().as_u16();
    let network_time = send_start.elapsed();

    // レスポンスヘッダーを取得
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            headers.insert(key.to_string(), value_str.to_string());
        }
    }

    // レスポンスボディを取得（サイズ制限付き）
    const MAX_RESPONSE_SIZE: usize = 50 * 1024 * 1024; // 50MB制限
    let body = response
        .text()
        .await
        .map_err(|e| {
            let err_msg = format!("[Request {}] Failed to read response body: {}", request_id, e);
            log::error!("{}", err_msg);
            err_msg
        })?;

    let response_size = body.len();
    let total_time = start_time.elapsed();

    // レスポンスサイズチェック
    if response_size > MAX_RESPONSE_SIZE {
        let err_msg = format!(
            "[Request {}] Response too large: {} bytes (limit: {} bytes)",
            request_id, response_size, MAX_RESPONSE_SIZE
        );
        log::error!("{}", err_msg);
        return Err(err_msg);
    }

    // ログ出力
    log::info!(
        "[Request {}] Response received | Status: {} | Size: {} bytes | Network: {:?} | Total: {:?}",
        request_id, status, response_size, network_time, total_time
    );

    // レスポンスボディをログに出力（デバッグ用）
    if request.path.contains("/responses") {
        let body_preview = if body.len() > 1000 {
            format!("{}...(truncated)", &body[..1000])
        } else {
            body.clone()
        };
        log::info!("[Request {}] Response body: {}", request_id, body_preview);
    }

    // 大きなレスポンスの警告
    if response_size > 10 * 1024 * 1024 {
        log::warn!("[Request {}] Large response detected: {} MB", request_id, response_size / 1024 / 1024);
    }

    // エラーレスポンスの場合はログに出力
    if status >= 400 {
        // エラーボディを省略表示（長すぎる場合）
        let body_preview = if body.len() > 500 {
            format!("{}... (truncated, total {} bytes)", &body[..500], body.len())
        } else {
            body.clone()
        };
        log::error!("[Request {}] OpenAI API error ({}): {}", request_id, status, body_preview);
    } else {
        log::info!("[Request {}] Request completed successfully", request_id);
    }

    Ok(OpenAIResponse {
        status,
        body,
        headers,
    })
}

pub async fn upload_file_to_openai(request: FileUploadRequest) -> Result<OpenAIResponse, String> {
    let request_id = Uuid::new_v4();
    let start_time = Instant::now();

    log::info!("[Request {}] Starting file upload: {}", request_id, request.file_name);

    // クライアントビルダーを作成
    let mut client_builder = Client::builder();

    // プロキシ設定があれば適用
    if let Some(proxy_config) = &request.proxy_config {
        if let Some(http_proxy) = &proxy_config.http_proxy {
            if !http_proxy.is_empty() {
                let proxy = Proxy::http(http_proxy)
                    .map_err(|e| format!("[Request {}] HTTP proxy error: {}", request_id, e))?;
                client_builder = client_builder.proxy(proxy);
            }
        }
        if let Some(https_proxy) = &proxy_config.https_proxy {
            if !https_proxy.is_empty() {
                let proxy = Proxy::https(https_proxy)
                    .map_err(|e| format!("[Request {}] HTTPS proxy error: {}", request_id, e))?;
                client_builder = client_builder.proxy(proxy);
            }
        }
    }

    let client = client_builder
        .build()
        .map_err(|e| format!("[Request {}] Failed to build HTTP client: {}", request_id, e))?;

    // Base64デコード
    let file_bytes = general_purpose::STANDARD
        .decode(&request.file_data)
        .map_err(|e| format!("[Request {}] Base64 decode error: {}", request_id, e))?;

    log::info!("[Request {}] File size: {} bytes", request_id, file_bytes.len());

    // URLを構築
    let base_url = request.base_url.trim_end_matches('/');
    let url = format!("{}/files", base_url);

    // multipart/form-data を作成
    let file_part = multipart::Part::bytes(file_bytes)
        .file_name(request.file_name.clone())
        .mime_str("application/octet-stream")
        .map_err(|e| format!("[Request {}] Failed to create file part: {}", request_id, e))?;

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("purpose", request.purpose.clone());

    // リクエストを送信
    log::info!("[Request {}] Uploading to {}", request_id, url);
    let mut req_builder = client.post(&url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .multipart(form);

    // 追加ヘッダーを設定
    if let Some(headers) = &request.additional_headers {
        for (key, value) in headers {
            req_builder = req_builder.header(key, value);
        }
    }

    let send_start = Instant::now();
    let response = req_builder
        .send()
        .await
        .map_err(|e| {
            log::error!("[Request {}] Upload failed: {}", request_id, e);
            format!("[Request {}] Failed to upload file: {}", request_id, e)
        })?;

    let status = response.status().as_u16();
    let network_time = send_start.elapsed();

    // レスポンスヘッダーを取得
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            headers.insert(key.to_string(), value_str.to_string());
        }
    }

    // レスポンスボディを取得
    let body = response
        .text()
        .await
        .map_err(|e| format!("[Request {}] Failed to read response: {}", request_id, e))?;

    let total_time = start_time.elapsed();

    log::info!(
        "[Request {}] Upload complete | Status: {} | Network: {:?} | Total: {:?}",
        request_id, status, network_time, total_time
    );

    if status >= 400 {
        log::error!("[Request {}] Upload error ({}): {}", request_id, status, body);
    }

    Ok(OpenAIResponse {
        status,
        body,
        headers,
    })
}
