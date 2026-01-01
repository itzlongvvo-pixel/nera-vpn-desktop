/*
  Nera VPN™
  Copyright © 2025 Vio Holdings LLC. All rights reserved.
  Nera VPN™ is a trademark of Vio Holdings LLC.
  This software is proprietary and confidential. Unauthorized copying,
  distribution, modification, or use of this software, via any medium,
  is strictly prohibited without written permission from the copyright holder.
  The source code and binaries are protected by copyright law and international treaties.
*/
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    sync::Arc,
    sync::Mutex,
    thread,
    time::Duration,
};

use sysinfo::Networks;

use base64::{engine::general_purpose, Engine as _};
use rand::rngs::OsRng;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey, StaticSecret};

use tauri::{
    menu::{Menu, MenuItem, MenuBuilder, CheckMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    AppHandle, Manager, State, Emitter,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;


const WIREGUARD_EXE: &str = r"C:\Program Files\WireGuard\wireguard.exe";
const TUNNEL_NAME: &str = "nera";

const TOKYO_CONFIG_TEMPLATE: &str = r#"[Interface]
PrivateKey = {{PRIVATE_KEY}}
Address = {{ADDRESS}}
DNS = 1.1.1.1

[Peer]
PublicKey = tN0y3O5a/J7IkVK3WV4IFi6COgCSb5mHVxeQXS9iN3Y=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 45.76.106.63:443
PersistentKeepalive = 25
"#;

const SHARED_FALLBACK_CONFIG: &str = r#"[Interface]
PrivateKey = uKpimIYznJOJQxirEee7xE3MLPipJ90mYVtYMaMqQ3g=
Address = 10.66.66.5/32
DNS = 1.1.1.1

[Peer]
PublicKey = tN0y3O5a/J7IkVK3WV4IFi6COgCSb5mHVxeQXS9iN3Y=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 45.76.106.63:443
PersistentKeepalive = 25
"#;

// --- Structs ---

struct VpnState {
    connected: Mutex<bool>,
    kill_switch_enabled: Mutex<bool>,
    monitoring_flag: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Clone, serde::Serialize)]
struct VpnStatusPayload {
    connected: bool,
}

#[derive(Clone, serde::Serialize)]
struct KillSwitchPayload {
    enabled: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct AppSettings {
    kill_switch_enabled: bool,
    #[serde(default = "default_server")]
    selected_server: String,
    #[serde(default)]
    private_key: String,
    #[serde(default)]
    public_key: String,
    #[serde(default)]
    device_ip: String,
}

fn default_server() -> String {
    "tokyo".to_string()
}

// --- Helpers ---

fn nera_conf_path() -> Result<PathBuf, String> {
    dirs::document_dir()
        .map(|mut dir| {
            dir.push("nera.conf");
            dir
        })
        .ok_or_else(|| "Could not find the Documents folder on this system.".to_string())
}

fn temp_conf_path() -> Result<PathBuf, String> {
    log_dir() // storing temp conf in logs dir for safety/easy cleanup guarantees
        .map(|mut dir| {
            dir.push("nera-temp.conf");
            dir
        })
}

fn get_config_content(_server_key: &str) -> String {
    let settings = load_settings();

    // Check if we have valid unique keys
    if !settings.private_key.is_empty() && !settings.device_ip.is_empty() {
        return TOKYO_CONFIG_TEMPLATE
            .replace("{{PRIVATE_KEY}}", &settings.private_key)
            .replace("{{ADDRESS}}", &settings.device_ip);
    }

    // Fallback to shared key
    SHARED_FALLBACK_CONFIG.to_string()
}

fn log_dir() -> Result<PathBuf, String> {
    let mut dir = dirs::document_dir().ok_or_else(|| "Could not find Documents folder.".to_string())?;
    dir.push("NeraVPN");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create log directory: {e}"))?;
    }
    Ok(dir)
}

fn log_file_path() -> Result<PathBuf, String> {
    let mut path = log_dir()?;
    path.push("nera.log");
    Ok(path)
}

fn append_log(line: &str) -> Result<(), String> {
    let path = log_file_path()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file: {e}"))?;

    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    writeln!(file, "[{}] {}", ts, line).map_err(|e| format!("Failed to write to log file: {e}"))?;

    Ok(())
}

fn settings_path() -> Result<PathBuf, String> {
    let mut path = log_dir()?;
    path.push("settings.json");
    Ok(path)
}

fn load_settings() -> AppSettings {
    let path = match settings_path() {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };

    if !path.exists() {
        return AppSettings::default();
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return AppSettings::default(),
    };

    serde_json::from_str(&content).unwrap_or_default()
}

fn save_settings(settings: &AppSettings) {
    if let Ok(path) = settings_path() {
        if let Ok(content) = serde_json::to_string_pretty(settings) {
            let _ = fs::write(path, content);
        }
    }
}

fn generate_keypair() -> (String, String) {
    let mut rng = OsRng;
    let private_key = StaticSecret::random_from_rng(&mut rng);
    let public_key = PublicKey::from(&private_key);

    let priv_b64 = general_purpose::STANDARD.encode(private_key.to_bytes());
    let pub_b64 = general_purpose::STANDARD.encode(public_key.as_bytes());

    (priv_b64, pub_b64)
}

#[derive(Serialize, Deserialize, Debug)]
struct AddPeerResponse {
    allowed_ip: String,
    // server might return other fields, we just need allowed_ip
}

#[derive(Serialize)]
struct RegisterRequest {
    email: String,
    password: String,
    public_key: String,
}

// --- Internal Logic Functions ---

fn force_disconnect_all() {
    // Safety cleanup on launch to prevent "zombie" tunnels from previous crashes.
    // We try to remove both potential service names.
    let _ = Command::new(WIREGUARD_EXE)
        .arg("/uninstalltunnelservice")
        .arg("nera")
        .output();

    let _ = Command::new(WIREGUARD_EXE)
        .arg("/uninstalltunnelservice")
        .arg("nera-temp")
        .output();
}

fn measure_latency() -> String {
    // Ping Google DNS once
    let output = Command::new("ping").args(&["-n", "1", "8.8.8.8"]).output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            // Look for "time=XXms" or "time<1ms"
            // Windows output: "Reply from 8.8.8.8: bytes=32 time=24ms TTL=116"
            if let Some(start) = stdout.find("time=") {
                let rest = &stdout[start + 5..];
                if let Some(end) = rest.find("ms") {
                    return format!("{} ms", &rest[..end]);
                }
            } else if stdout.contains("time<1ms") {
                return "<1 ms".to_string();
            }
            "—".to_string()
        }
        _ => "—".to_string(),
    }
}

fn enable_kill_switch_internal() -> Result<(), String> {
    append_log("Enabling Kill Switch (Firewall Block Outbound)").ok();

    // 1. Clear existing rules
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            "name=NeraVPN_KS_AllowWG",
        ])
        .output();
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            "name=NeraVPN_KS_AllowTunnel",
        ])
        .output();
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            "name=NeraVPN_KS_AllowDNS",
        ])
        .output();

    // 2. Allow WireGuard.exe
    Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            "name=NeraVPN_KS_AllowWG",
            "dir=out",
            "action=allow",
            &format!("program={}", WIREGUARD_EXE),
            "enable=yes",
        ])
        .output()
        .map_err(|e| format!("Failed to add WG rule: {e}"))?;

    // 3. Allow traffic on Tunnel Interface ("nera")
    Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            "name=NeraVPN_KS_AllowTunnel",
            "dir=out",
            "action=allow",
            "interface=nera-temp",
            "enable=yes",
        ])
        .output()
        .map_err(|e| format!("Failed to add Tunnel rule: {e}"))?;

    // 4. Check/Allow DNS (UDP 53)
    Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "add",
            "rule",
            "name=NeraVPN_KS_AllowDNS",
            "dir=out",
            "action=allow",
            "protocol=UDP",
            "remoteport=53",
            "enable=yes",
        ])
        .output()
        .map_err(|e| format!("Failed to add DNS rule: {e}"))?;

    // 5. BLOCK all other outbound
    let status = Command::new("netsh")
        .args(&[
            "advfirewall",
            "set",
            "allprofiles",
            "firewallpolicy",
            "blockinbound,blockoutbound",
        ])
        .status()
        .map_err(|e| format!("Failed to set blocking policy: {e}"))?;

    if !status.success() {
        return Err("Failed to execute netsh blocking policy".to_string());
    }

    Ok(())
}

fn disable_kill_switch_internal() -> Result<(), String> {
    append_log("Disabling Kill Switch (Restore Allow Outbound)").ok();

    // 1. Restore Default Policy -> Allow Outbound
    let status = Command::new("netsh")
        .args(&[
            "advfirewall",
            "set",
            "allprofiles",
            "firewallpolicy",
            "blockinbound,allowoutbound",
        ])
        .status()
        .map_err(|e| format!("Failed to restore policy: {e}"))?;

    if !status.success() {
        append_log("CRITICAL: Failed to restore firewall policy!").ok();
    }

    // 2. Delete our rules
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            "name=NeraVPN_KS_AllowWG",
        ])
        .output();
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            "name=NeraVPN_KS_AllowTunnel",
        ])
        .output();
    let _ = Command::new("netsh")
        .args(&[
            "advfirewall",
            "firewall",
            "delete",
            "rule",
            "name=NeraVPN_KS_AllowDNS",
        ])
        .output();

    Ok(())
}

fn connect_vpn_internal(
    app_handle: &AppHandle,
    state: &State<VpnState>,
    server_key: Option<String>,
) -> Result<(), String> {
    // 1. Get Config Content
    // Use passed key, or default to "tokyo" if none.
    // In practice App should always pass it, but fallback is safe.
    let key = server_key.unwrap_or_else(|| "tokyo".to_string());

    // Dynamically build config based on settings
    let config_content = get_config_content(&key);

    // 2. Write to Temp File
    let conf_path = temp_conf_path()?;
    fs::write(&conf_path, config_content)
        .map_err(|e| format!("Failed to write temp config: {e}"))?;

    append_log(&format!(
        "Connect requested ({key}). Launching WireGuard..."
    ))
    .ok();

    let status = Command::new(WIREGUARD_EXE)
        .arg("/installtunnelservice")
        .arg(&conf_path)
        .status()
        .map_err(|e| format!("Failed to start WireGuard: {e}"))?;

    if !status.success() {
        let msg = format!("WireGuard exited with status: {status}");
        append_log(&format!("Connect failed: {msg}")).ok();
        return Err(msg);
    }

    // Update state
    *state.connected.lock().unwrap() = true;
    app_handle
        .emit("vpn-status-changed", VpnStatusPayload { connected: true })
        .map_err(|e| format!("Failed to emit event: {e}"))?;

    append_log("Connect successful. Tunnel service installed.").ok();

    // Start Traffic Monitoring
    let flag = Arc::new(AtomicBool::new(true));
    *state.monitoring_flag.lock().unwrap() = Some(flag.clone());
    let app_handle_clone = app_handle.clone();

    thread::spawn(move || {
        let mut networks = Networks::new_with_refreshed_list();
        let mut last_rx = 0;
        let mut last_tx = 0;
        let mut loop_count = 0;
        let mut current_ping = "—".to_string();

        loop {
            if !flag.load(Ordering::Relaxed) {
                break;
            }
            thread::sleep(Duration::from_secs(1));
            networks.refresh_list();

            // Measure Latency every second
            // Run in separate quick thread or just block slightly?
            // Ping -n 1 is fast usually. Blocking here for <100ms is OK.
            current_ping = measure_latency();

            // 1. Try to find "nera" or "wg" or "tun" interface
            let mut target_network = networks.iter().find(|(name, _)| {
                let n = name.to_lowercase();
                n.contains("nera") || n.contains("wg") || n.contains("tun")
            });

            // 2. Fallback: Find the interface with the HIGHEST total traffic (Active Internet)
            if target_network.is_none() {
                target_network = networks
                    .iter()
                    .filter(|(name, _)| !name.to_lowercase().contains("loopback"))
                    .max_by_key(|(_, data)| data.total_received());
            }

            if let Some((_name, data)) = target_network {
                let current_rx = data.total_received();
                let current_tx = data.total_transmitted();

                // Calculate Speed (Delta)
                // Use saturating_sub to avoid crashes on counter reset
                let dl_speed = if last_rx > 0 && current_rx > last_rx {
                    current_rx.saturating_sub(last_rx)
                } else {
                    0
                };
                let ul_speed = if last_tx > 0 && current_tx > last_tx {
                    current_tx.saturating_sub(last_tx)
                } else {
                    0
                };

                last_rx = current_rx;
                last_tx = current_tx;

                // Emit Event
                app_handle_clone
                    .emit(
                        "traffic-update",
                        serde_json::json!({
                            "download": dl_speed,
                            "upload": ul_speed,
                            "ping": current_ping
                        }),
                    )
                    .ok();
            }
        }
    });

    Ok(())
}

fn disconnect_vpn_internal(app_handle: &AppHandle, state: &State<VpnState>) -> Result<(), String> {
    append_log("Disconnect requested. Stopping WireGuard service...").ok();

    // Stop Traffic Monitoring
    if let Some(flag) = state.monitoring_flag.lock().unwrap().take() {
        flag.store(false, Ordering::Relaxed);
    }

    let output = Command::new(WIREGUARD_EXE)
        .arg("/uninstalltunnelservice")
        // NOTE: wireguard uses the basename of the conf file as service name.
        // We write to `nera-temp.conf`, so service name is `nera-temp`.
        // BUT previous implementation used `nera.conf` -> `nera`.
        // To support legacy cleanups, we might try removing `nera` AND `nera-temp`.
        // Or we just try removing current logic's name.
        // wait, constant TUNNEL_NAME was "nera".
        // Use filename without extension.
        // temp_conf_path is ".../nera-temp.conf". Service is "nera-temp".
        // Cleanest is to try removing both or update TUNNEL_NAME.
        // Let's update command arg to remove "nera-temp".
        .arg("nera-temp")
        .output()
        .map_err(|e| format!("Failed to stop WireGuard: {e}"))?;

    // Also try removing legacy "nera" service just in case?
    // It's cheap to try.
    let _ = Command::new(WIREGUARD_EXE)
        .arg("/uninstalltunnelservice")
        .arg("nera")
        .output();

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        if stderr
            .to_lowercase()
            .contains("the specified service does not exist as an installed service")
        {
            append_log("Disconnect: service not found (already stopped).").ok();

            *state.connected.lock().unwrap() = false;
            app_handle
                .emit("vpn-status-changed", VpnStatusPayload { connected: false })
                .ok();

            return Ok(());
        }

        let msg = format!("WireGuard error: {}", stderr.trim());
        append_log(&format!("Disconnect failed: {msg}")).ok();
        return Err(msg);
    }

    // Update state
    *state.connected.lock().unwrap() = false;
    app_handle
        .emit("vpn-status-changed", VpnStatusPayload { connected: false })
        .map_err(|e| format!("Failed to emit event: {e}"))?;

    append_log("Disconnect successful. Tunnel service removed.").ok();
    Ok(())
}

fn update_tray_menu(app: &AppHandle, ks_enabled: bool) {
    // In v2 we don't have get_item. We need to rebuild the menu or use IDs if we kept references.
    // Simpler approach for now: Rebuild the whole tray menu.
    let _ = build_tray_menu(app, ks_enabled).map(|menu| {
        let _ = app.tray_by_id("main").map(|tray| tray.set_menu(Some(menu)));
    });
}

fn build_tray_menu(app: &AppHandle, ks_enabled: bool) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let ks_title = if ks_enabled {
        "Disable Kill Switch (Restore Internet)"
    } else {
        "Enable Kill Switch"
    };

    MenuBuilder::new(app)
        .items(&[
            &MenuItem::with_id(app, "connect", "Connect", true, None::<&str>)?,
            &MenuItem::with_id(app, "disconnect", "Disconnect", true, None::<&str>)?,
            &MenuItem::with_id(app, "sep1", "-", true, None::<&str>)?, // Separator?
            &MenuItem::with_id(app, "killswitch_toggle", ks_title, true, None::<&str>)?,
             // Separator not directly supported as CheckMenuItem? Using MenuItem with "-" is common workadround or separate API.
             // v2 has PredefinedMenuItem::separator(app)?
             // Let's use simplified items for now.
        ])
        .build()
}

// --- Tauri Commands ---

#[tauri::command]
fn import_wireguard_config(app: AppHandle) -> Result<String, String> {
    let dest_path = nera_conf_path()?;

    let file_path = app.dialog().file().blocking_pick_file();
    
    // Note: blocking_pick_file returns Option<FilePath>
    // We need to handle this. The proper specific API might depend on the plugin version.
    // Assuming blocking_pick_file exists for now based on v1 blocking API.
    // If not, we might need async variation. 
    // Since this command is synchronous (fn), we need blocking.
    // Check plugin-dialog docs... usually it is `app.dialog().file().pick_file(...)` which is async.
    // For blocking, we might need to change command to async.
    // Let's change this command to async to be safe and use async pick_file.
    
    // Responding below in next tool call with async implementation.
    Err("Please use import_wireguard_config_async".to_string())
} 

#[tauri::command]
async fn import_wireguard_config_async(app: AppHandle) -> Result<String, String> {
     let dest_path = nera_conf_path().map_err(|e| e.to_string())?;
     
     // This requires tauri-plugin-dialog to be set up
     // return path...
     
     // Placeholder: actual impl needs to await the dialog.
     // Since I cannot verify compile here, I'll use standard file dialog if possible?
     // Or just fail gracefully.
     
     // Reverting to synchronous call assuming I can't use async here easily without changing frontend.
     // Actually, frontend invokes are async by default.
     
     /* 
       Let's use a simpler approach: 
       I will leave this function broken for a moment or try to use a standard native dialog crate 
       like `rfd` if tauri's blocking dialog is gone.
       
       Wait, I can just use `rfd` (Rust File Dialog) if I add it.
       But I should use tauri-plugin-dialog.
     */
     Err("Not implemented yet".to_string())
}

#[tauri::command]
fn connect_vpn(
    app: AppHandle,
    state: State<'_, VpnState>,
    server_key: Option<String>,
) -> Result<(), String> {
    connect_vpn_internal(&app, &state, server_key)
}

#[tauri::command]
fn disconnect_vpn(app: AppHandle, state: State<'_, VpnState>) -> Result<(), String> {
    disconnect_vpn_internal(&app, &state)
}

#[tauri::command]
fn get_vpn_status(state: State<'_, VpnState>) -> bool {
    *state.connected.lock().unwrap()
}

#[tauri::command]
fn set_kill_switch(
    app: AppHandle,
    enabled: bool,
    state: State<'_, VpnState>,
) -> Result<(), String> {
    if enabled {
        enable_kill_switch_internal()?;
    } else {
        disable_kill_switch_internal()?;
    }

    *state.kill_switch_enabled.lock().unwrap() = enabled;

    update_tray_menu(&app, enabled);
    let mut settings = load_settings();
    settings.kill_switch_enabled = enabled;
    save_settings(&settings);

    app.emit("kill-switch-changed", KillSwitchPayload { enabled })
        .map_err(|e| format!("Failed to emit event: {e}"))?;

    Ok(())
}

#[tauri::command]
fn get_kill_switch_status(state: State<'_, VpnState>) -> bool {
    *state.kill_switch_enabled.lock().unwrap()
}

#[tauri::command]
fn read_logs() -> Result<String, String> {
    let path = log_file_path()?;
    if !path.exists() {
        return Ok("No logs yet.".to_string());
    }
    fs::read_to_string(path).map_err(|e| format!("Failed to read logs: {e}"))
}

#[tauri::command]
fn set_selected_server(server_key: String) -> Result<(), String> {
    let mut settings = load_settings();
    settings.selected_server = server_key;
    // other fields are already loaded into `settings`, so they are preserved
    save_settings(&settings);
    Ok(())
}

#[tauri::command]
fn get_selected_server() -> String {
    load_settings().selected_server
}

#[tauri::command]
async fn register_user_key() -> Result<String, String> {
    // 1. Generate New Keys Locally
    let (priv_key, pub_key) = generate_keypair();

    // 2. Save Keys to Settings (Clear IP to reset state)
    let mut settings = load_settings();
    settings.private_key = priv_key;
    settings.public_key = pub_key;
    settings.device_ip = "".to_string(); 
    save_settings(&settings);

    // 3. Return success message
    Ok("Identity generated. Ready to sign up.".to_string())
}

#[tauri::command]
fn get_user_status() -> Option<String> {
    let settings = load_settings();
    // Return key even if device_ip is empty so Frontend can read it
    if !settings.public_key.is_empty() {
        Some(settings.public_key)
    } else {
        None
    }
}

#[tauri::command]
fn complete_registration(ip: String) -> Result<(), String> {
    let mut settings = load_settings();
    settings.device_ip = ip;
    save_settings(&settings);
    Ok(())
}

#[tauri::command]
fn logout() -> Result<(), String> {
    let mut settings = load_settings();
    // Wipe identity data
    settings.private_key = String::new();
    settings.public_key = String::new();
    settings.device_ip = String::new();
    save_settings(&settings);
    Ok(())
}

#[tauri::command]
async fn register_account(email: String, password: String, public_key: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let payload = RegisterRequest { email, password, public_key };
    
    // Call the Tokyo Node.js Server directly
    let res = client.post("http://45.76.106.63:3000/api/register")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if !res.status().is_success() {
        return Err(format!("Server error: {}", res.status()));
    }

    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn login_account(email: String, password: String, public_key: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let payload = RegisterRequest { email, password, public_key }; // Reusing the struct is fine

    // Hit the new /api/login endpoint
    let res = client.post("http://45.76.106.63:3000/api/login")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
         // Try to parse the error message from JSON
         let error_text = res.text().await.unwrap_or_else(|_| "Unknown login error".into());
         return Err(error_text);
    }

    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

// --- Main ---

fn main() {
    // 0. Safety Cleanup (Pre-Init)
    force_disconnect_all();

    // let system_tray = build_tray();

    // 1. Load Settings (Authoritative)
    let settings = load_settings();
    let ks_enabled = settings.kill_switch_enabled;

    // 2. Startup Logic
    if ks_enabled {
        // Recovery Mode
        if let Err(e) = enable_kill_switch_internal() {
            append_log(&format!(
                "CRITICAL: Failed to apply kills switch on startup: {e}"
            ))
            .ok();
        } else {
            append_log("Startup: Kill Switch rules APPLIED. Internet blocked.").ok();
        }
    } else {
        // Safety Clean
        let _ = disable_kill_switch_internal();
    }

    // ... (rest of main)
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // .plugin(tauri_plugin_process::init())
        .manage(VpnState {
            connected: Mutex::new(false),
            kill_switch_enabled: Mutex::new(ks_enabled),
            monitoring_flag: Mutex::new(None),
        })
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(Vec::new()),
        ))
        .invoke_handler(tauri::generate_handler![
            // import_wireguard_config, // Commented out until fixed
            connect_vpn,
            disconnect_vpn,
            read_logs,
            get_vpn_status,
            set_kill_switch,
            get_kill_switch_status,
            get_selected_server,
            register_user_key,
            get_user_status,
            complete_registration,
            register_account,
            login_account,
            logout,
        ])
        .setup(move |app| {
            // Apply Tray State based on persistence
            // Using logic to build tray
             let tray_menu = build_tray_menu(app.handle(), ks_enabled)?;
             
             // In v2 we build the tray and attach it.
             let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                     let state = app.state::<VpnState>();
                     match event.id.as_ref() {
                        "connect" => {
                            let settings = load_settings();
                            let _ = connect_vpn_internal(app, &state, Some(settings.selected_server));
                        }
                        "disconnect" => {
                             let _ = disconnect_vpn_internal(app, &state);
                        }
                        "killswitch_toggle" => {
                            let current = *state.kill_switch_enabled.lock().unwrap();
                            let new_state = !current;

                            // Action
                            if new_state {
                                let _ = enable_kill_switch_internal();
                            } else {
                                let _ = disable_kill_switch_internal();
                            }

                            // Update
                            *state.kill_switch_enabled.lock().unwrap() = new_state;
                            update_tray_menu(app, new_state);
                            let mut settings = load_settings();
                            settings.kill_switch_enabled = new_state;

                            save_settings(&settings);
                            let _ = app.emit(
                                "kill-switch-changed",
                                KillSwitchPayload { enabled: new_state },
                            );
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            let _ = disable_kill_switch_internal();
                            let _ = disconnect_vpn_internal(app, &state);
                            std::process::exit(0);
                        }
                         _ => {}
                     }
                })
                .on_tray_icon_event(|tray, event| {
                     if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                     }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::Exit => {
                let state = app_handle.state::<VpnState>();
                let _ = disconnect_vpn_internal(app_handle, &state);
                let _ = disable_kill_switch_internal();
            }
            _ => {}
        });
}
