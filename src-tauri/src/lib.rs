use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

const LOCAL_DAEMON_HOST: &str = "127.0.0.1";
const LOCAL_DAEMON_RPC_PORT: u16 = 35781;
const LOCAL_WALLET_RPC_PORT: u16 = 35784;

#[derive(Serialize)]
struct NetworkDefaults {
    p2p_port: u16,
    daemon_rpc_port: u16,
    zmq_port: u16,
    wallet_rpc_port: u16,
}

#[derive(Debug, Default, Deserialize)]
struct GetInfoResponse {
    height: Option<u64>,
    target_height: Option<u64>,
    difficulty: Option<u64>,
    target: Option<u64>,
    incoming_connections_count: Option<u64>,
    outgoing_connections_count: Option<u64>,
    synchronized: Option<bool>,
    status: Option<String>,
    version: Option<String>,
}

#[derive(Serialize)]
struct DaemonInfo {
    reachable: bool,
    host: String,
    port: u16,
    height: Option<u64>,
    target_height: Option<u64>,
    difficulty: Option<u64>,
    target_seconds: Option<u64>,
    incoming_connections: Option<u64>,
    outgoing_connections: Option<u64>,
    synchronized: Option<bool>,
    status: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
struct WalletRpcStatus {
    reachable: bool,
    host: String,
    port: u16,
    version: Option<u64>,
    release: Option<bool>,
    error: Option<String>,
}

#[tauri::command]
fn network_defaults() -> NetworkDefaults {
    NetworkDefaults {
        p2p_port: 35780,
        daemon_rpc_port: LOCAL_DAEMON_RPC_PORT,
        zmq_port: 35782,
        wallet_rpc_port: LOCAL_WALLET_RPC_PORT,
    }
}

fn local_socket(port: u16) -> Option<SocketAddr> {
    format!("{LOCAL_DAEMON_HOST}:{port}")
        .to_socket_addrs()
        .ok()
        .and_then(|mut addresses| addresses.next())
}

fn open_local_stream(port: u16) -> Result<TcpStream, String> {
    let address =
        local_socket(port).ok_or_else(|| "Unable to resolve local service".to_string())?;
    let stream = TcpStream::connect_timeout(&address, Duration::from_millis(900))
        .map_err(|_| "Local service is not reachable".to_string())?;

    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;

    Ok(stream)
}

fn read_http_json(mut stream: TcpStream, request: &[u8]) -> Result<Value, String> {
    stream
        .write_all(request)
        .map_err(|error| format!("Unable to write local RPC request: {error}"))?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("Unable to read local RPC response: {error}"))?;

    let response = String::from_utf8(response)
        .map_err(|_| "Local RPC returned a non-UTF-8 response".to_string())?;
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Local RPC returned an invalid HTTP response".to_string())?;

    if !headers.starts_with("HTTP/1.1 200") && !headers.starts_with("HTTP/1.0 200") {
        return Err("Local RPC returned a non-success HTTP status".to_string());
    }

    serde_json::from_str(body).map_err(|error| format!("Unable to parse local RPC JSON: {error}"))
}

fn fetch_local_daemon_info() -> Result<GetInfoResponse, String> {
    let stream = open_local_stream(LOCAL_DAEMON_RPC_PORT)?;
    let request = concat!(
        "GET /get_info HTTP/1.1\r\n",
        "Host: 127.0.0.1:35781\r\n",
        "Accept: application/json\r\n",
        "Connection: close\r\n",
        "\r\n"
    );

    let value = read_http_json(stream, request.as_bytes())?;
    serde_json::from_value(value)
        .map_err(|error| format!("Unable to decode daemon information: {error}"))
}

fn call_wallet_rpc(method: &str) -> Result<Value, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": "feelcoin-desktop",
        "method": method
    })
    .to_string();

    let request = format!(
        concat!(
            "POST /json_rpc HTTP/1.1\r\n",
            "Host: 127.0.0.1:35784\r\n",
            "Content-Type: application/json\r\n",
            "Accept: application/json\r\n",
            "Content-Length: {}\r\n",
            "Connection: close\r\n",
            "\r\n",
            "{}"
        ),
        payload.len(),
        payload
    );

    read_http_json(
        open_local_stream(LOCAL_WALLET_RPC_PORT)?,
        request.as_bytes(),
    )
}

#[tauri::command]
fn daemon_info() -> DaemonInfo {
    match fetch_local_daemon_info() {
        Ok(info) => DaemonInfo {
            reachable: true,
            host: LOCAL_DAEMON_HOST.to_string(),
            port: LOCAL_DAEMON_RPC_PORT,
            height: info.height,
            target_height: info.target_height,
            difficulty: info.difficulty,
            target_seconds: info.target,
            incoming_connections: info.incoming_connections_count,
            outgoing_connections: info.outgoing_connections_count,
            synchronized: info.synchronized,
            status: info.status,
            version: info.version,
            error: None,
        },
        Err(error) => DaemonInfo {
            reachable: false,
            host: LOCAL_DAEMON_HOST.to_string(),
            port: LOCAL_DAEMON_RPC_PORT,
            height: None,
            target_height: None,
            difficulty: None,
            target_seconds: None,
            incoming_connections: None,
            outgoing_connections: None,
            synchronized: None,
            status: None,
            version: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
fn wallet_rpc_status() -> WalletRpcStatus {
    match call_wallet_rpc("get_version") {
        Ok(value) => WalletRpcStatus {
            reachable: value.get("error").is_none(),
            host: LOCAL_DAEMON_HOST.to_string(),
            port: LOCAL_WALLET_RPC_PORT,
            version: value
                .get("result")
                .and_then(|result| result.get("version"))
                .and_then(Value::as_u64),
            release: value
                .get("result")
                .and_then(|result| result.get("release"))
                .and_then(Value::as_bool),
            error: value
                .get("error")
                .map(|error| error.to_string())
                .filter(|error| !error.is_empty()),
        },
        Err(error) => WalletRpcStatus {
            reachable: false,
            host: LOCAL_DAEMON_HOST.to_string(),
            port: LOCAL_WALLET_RPC_PORT,
            version: None,
            release: None,
            error: Some(error),
        },
    }
}

const MOBILE_POOL: &str = "https://pool.feelcoin.org";
const MOBILE_EXPLORER: &str = "https://explorer.feelcoin.org";

// Explorer queries are read-only, strictly constrained to our official domain.
// No wallet credentials, secret keys, or arbitrary URLs are accepted here.
async fn explorer_json(path: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Unable to initialize the secure explorer connection".to_string())?;
    let response = client
        .get(format!("{MOBILE_EXPLORER}{path}"))
        .send()
        .await
        .map_err(|_| "Official explorer is unavailable".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Explorer returned HTTP {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > 2_000_000)
    {
        return Err("Explorer response is too large".into());
    }
    let body = response
        .bytes()
        .await
        .map_err(|_| "Unable to read explorer response".to_string())?;
    if body.len() > 2_000_000 {
        return Err("Explorer response is too large".into());
    }
    serde_json::from_slice(&body).map_err(|_| "Explorer returned invalid JSON".to_string())
}

#[tauri::command]
async fn mobile_explorer_home() -> Result<Value, String> {
    let data = explorer_json("/api/home").await?;
    if !data.get("info").is_some_and(Value::is_object)
        || !data.get("blocks").is_some_and(Value::is_array)
    {
        return Err("Explorer returned incomplete blockchain information".into());
    }
    Ok(data)
}

#[tauri::command]
async fn mobile_explorer_search(query: String) -> Result<Value, String> {
    let query = query.trim();
    // Search by decimal block height or exact 64-character hexadecimal block/tx hash.
    let is_height =
        !query.is_empty() && query.len() <= 12 && query.bytes().all(|b| b.is_ascii_digit());
    let is_hash = query.len() == 64 && query.bytes().all(|b| b.is_ascii_hexdigit());
    if !is_height && !is_hash {
        return Err("Enter a block height or a 64-character block/transaction hash".into());
    }
    let data = explorer_json(&format!("/api/search?q={query}")).await?;
    if !["block-height", "block-hash", "transaction"]
        .iter()
        .any(|kind| data.get("type").and_then(Value::as_str) == Some(*kind))
    {
        return Err("Explorer did not return a recognized block or transaction".into());
    }
    Ok(data)
}

#[tauri::command]
async fn mobile_network_status() -> Result<Value, String> {
    let data = explorer_json("/network-status.json").await?;
    if !data.get("network").is_some_and(Value::is_object)
        || !data.get("nodes").is_some_and(Value::is_object)
    {
        return Err("Official node status feed is unavailable".into());
    }
    Ok(data)
}

fn check_public_address(address: &str) -> Result<(), String> {
    if address.len() < 90 || address.len() > 110
       || !address.bytes().all(|b| matches!(b, b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z'))
    {
        return Err("Invalid FEEL public address format".into());
    }
    Ok(())
}

async fn request_pool(path: &str, wallet_address: Option<&str>) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Failed to initialize secure pool client".to_string())?;
    let mut req = client.get(format!("{MOBILE_POOL}{path}"));
    if let Some(address) = wallet_address {
        check_public_address(address)?;
        req = req.header(reqwest::header::COOKIE, format!("wa={address}"));
    }
    let response = req
        .send()
        .await
        .map_err(|_| "The official mining pool is unreachable".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Pool HTTP error {}", response.status().as_u16()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| "Could not decode pool response".to_string())
}

#[tauri::command]
async fn mobile_pool_stats(wallet_address: Option<String>) -> Result<Value, String> {
    request_pool("/stats", wallet_address.as_deref()).await
}

#[tauri::command]
async fn mobile_pool_workers(wallet_address: String) -> Result<Value, String> {
    let value = request_pool("/workers", Some(&wallet_address)).await?;
    if !value.is_array() {
        return Err("Invalid worker list".into());
    }
    Ok(value)
}

#[tauri::command]
async fn mobile_pool_payments(wallet_address: String) -> Result<Value, String> {
    let value = request_pool("/miner-payments", Some(&wallet_address)).await?;
    let list = value.get("payments").cloned().unwrap_or(json!([]));
    if !list.is_array() {
        return Err("Invalid payment history".into());
    }
    Ok(list)
}

#[tauri::command]
fn mobile_open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let approved = [
        "https://wallet.feelcoin.org",
        "https://feelcoin.org",
        "https://pool.feelcoin.org",
        "https://explorer.feelcoin.org",
        "https://github.com/feelcoin-org/feelcoin-desktop",
    ];
    if !approved.contains(&url.as_str()) {
        return Err("Link is not on the official allowlist".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Could not launch default browser".to_string())
}


// Strict, read-only blockchain requests, plus explicit signed-transaction relay.
// Private wallet material is never accepted by this API.
#[tauri::command]
async fn mobile_chain_request(path: String, method: String, body: Option<Value>) -> Result<Value, String> {
    const BASE: &str = "https://wallet.feelcoin.org";
    let is_get = method == "GET";
    let is_post = method == "POST";
    let permitted = if is_get {
        path == "/api/health" || path == "/api/chain/fee" ||
        path == "/api/chain/output-distribution" ||
        path.starts_with("/api/chain/blocks?start=") && path.bytes().all(|c| c.is_ascii_alphanumeric() || b"/=?&".contains(&c)) ||
        path.starts_with("/api/chain/block/") && path[17..].bytes().all(|c| c.is_ascii_digit())
    } else if is_post {
        matches!(path.as_str(), "/api/chain/transactions" | "/api/chain/outs" |
            "/api/chain/key-images-spent" | "/api/chain/mix-outs" |
            "/api/chain/validate" | "/api/chain/broadcast-live")
    } else { false };
    if !permitted || path.len() > 150 { return Err("Blocked blockchain API request".into()); }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "Wallet network unavailable".to_string())?;
    let request = if is_get { client.get(format!("{BASE}{path}")) }
                  else { client.post(format!("{BASE}{path}")).json(&body.unwrap_or(json!({}))) };
    let response = request.send().await.map_err(|_| "Wallet blockchain API unavailable".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Wallet blockchain API HTTP {}", response.status().as_u16()));
    }
    if response.content_length().is_some_and(|n| n > 12_000_000) {
        return Err("Wallet API response exceeds limit".into());
    }
    let bytes = response.bytes().await.map_err(|_| "Unable to read blockchain response".to_string())?;
    if bytes.len() > 12_000_000 { return Err("Wallet API response exceeds limit".into()); }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid blockchain API JSON".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            network_defaults,
            daemon_info,
            wallet_rpc_status,
            mobile_pool_stats,
            mobile_pool_workers,
            mobile_pool_payments,
            mobile_explorer_home,
            mobile_explorer_search,
            mobile_network_status,
            mobile_open_link,
            mobile_chain_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running Feelcoin Desktop");
}
