use reqwest::{Client, Proxy};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use uuid::Uuid;

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

    // レスポンスボディを取得
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

    // ログ出力
    log::info!(
        "[Request {}] Response received | Status: {} | Size: {} bytes | Network: {:?} | Total: {:?}",
        request_id, status, response_size, network_time, total_time
    );

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
