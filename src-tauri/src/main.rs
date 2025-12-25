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
    sync::Mutex,
};

use base64::{engine::general_purpose, Engine as _};
use rand::rngs::OsRng;
use x25519_dalek::{PublicKey, StaticSecret};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

use tauri::{
    api::{
        dialog::blocking::FileDialogBuilder,
        path::document_dir,
    },
    CustomMenuItem,
    Icon,
    Manager,
    State,
    AppHandle,
    SystemTray,
    SystemTrayEvent,
    SystemTrayMenu,
    SystemTrayMenuItem,
};
use tauri_plugin_autostart::MacosLauncher;

const WIREGUARD_EXE: &str = r"C:\Program Files\WireGuard\wireguard.exe";
const TUNNEL_NAME: &str = "nera";

const TOKYO_CONFIG_TEMPLATE: &str = r#"[Interface]
PrivateKey = {{PRIVATE_KEY}}
Address = {{ADDRESS}}
DNS = 8.8.8.8

[Peer]
PublicKey = tN0y3O5a/J7IkVK3WV4IFi6COgCSb5mHVxeQXS9iN3Y=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 45.76.106.63:64070
PersistentKeepalive = 25
"#;

const SHARED_FALLBACK_CONFIG: &str = r#"[Interface]
PrivateKey = uKpimIYznJOJQxirEee7xE3MLPipJ90mYVtYMaMqQ3g=
Address = 10.66.66.5/32
DNS = 1.1.1.1

[Peer]
PublicKey = tN0y3O5a/J7IkVK3WV4IFi6COgCSb5mHVxeQXS9iN3Y=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 45.76.106.63:64070
PersistentKeepalive = 25
"#;

// --- Structs ---

struct VpnState {
    connected: Mutex<bool>,
    kill_switch_enabled: Mutex<bool>,
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
    document_dir()
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
    let mut dir = document_dir().ok_or_else(|| "Could not find Documents folder.".to_string())?;
    dir.push("NeraVPN");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create log directory: {e}"))?;
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
    writeln!(file, "[{}] {}", ts, line)
        .map_err(|e| format!("Failed to write to log file: {e}"))?;

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

// --- Internal Logic Functions ---

fn enable_kill_switch_internal() -> Result<(), String> {
    append_log("Enabling Kill Switch (Firewall Block Outbound)").ok();

    // 1. Clear existing rules
    let _ = Command::new("netsh")
        .args(&["advfirewall", "firewall", "delete", "rule", "name=NeraVPN_KS_AllowWG"])
        .output();
    let _ = Command::new("netsh")
        .args(&["advfirewall", "firewall", "delete", "rule", "name=NeraVPN_KS_AllowTunnel"])
        .output();
    let _ = Command::new("netsh")
        .args(&["advfirewall", "firewall", "delete", "rule", "name=NeraVPN_KS_AllowDNS"])
        .output();

    // 2. Allow WireGuard.exe
    Command::new("netsh")
        .args(&[
            "advfirewall", "firewall", "add", "rule",
            "name=NeraVPN_KS_AllowWG",
            "dir=out", "action=allow",
            &format!("program={}", WIREGUARD_EXE),
            "enable=yes"
        ])
        .output()
        .map_err(|e| format!("Failed to add WG rule: {e}"))?;

    // 3. Allow traffic on Tunnel Interface ("nera")
    Command::new("netsh")
        .args(&[
            "advfirewall", "firewall", "add", "rule",
            "name=NeraVPN_KS_AllowTunnel",
            "dir=out", "action=allow",
            "interface=nera", 
            "enable=yes"
        ])
        .output()
        .map_err(|e| format!("Failed to add Tunnel rule: {e}"))?;

     // 4. Check/Allow DNS (UDP 53)
     Command::new("netsh")
        .args(&[
            "advfirewall", "firewall", "add", "rule",
            "name=NeraVPN_KS_AllowDNS",
            "dir=out", "action=allow", "protocol=UDP", "remoteport=53", "enable=yes"
        ])
        .output()
        .map_err(|e| format!("Failed to add DNS rule: {e}"))?;

    // 5. BLOCK all other outbound
    let status = Command::new("netsh")
        .args(&["advfirewall", "set", "allprofiles", "firewallpolicy", "blockinbound,blockoutbound"])
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
        .args(&["advfirewall", "set", "allprofiles", "firewallpolicy", "blockinbound,allowoutbound"])
        .status()
        .map_err(|e| format!("Failed to restore policy: {e}"))?;

    if !status.success() {
         append_log("CRITICAL: Failed to restore firewall policy!").ok();
    }

    // 2. Delete our rules
    let _ = Command::new("netsh")
        .args(&["advfirewall", "firewall", "delete", "rule", "name=NeraVPN_KS_AllowWG"])
        .output();
    let _ = Command::new("netsh")
        .args(&["advfirewall", "firewall", "delete", "rule", "name=NeraVPN_KS_AllowTunnel"])
        .output();
    let _ = Command::new("netsh")
        .args(&["advfirewall", "firewall", "delete", "rule", "name=NeraVPN_KS_AllowDNS"])
        .output();

    Ok(())
}

fn connect_vpn_internal(app_handle: &AppHandle, state: &State<VpnState>, server_key: Option<String>) -> Result<(), String> {
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

    append_log(&format!("Connect requested ({key}). Launching WireGuard...")).ok();

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
    app_handle.emit_all("vpn-status-changed", VpnStatusPayload { connected: true })
        .map_err(|e| format!("Failed to emit event: {e}"))?;

    append_log("Connect successful. Tunnel service installed.").ok();
    Ok(())
}

fn disconnect_vpn_internal(app_handle: &AppHandle, state: &State<VpnState>) -> Result<(), String> {
    append_log("Disconnect requested. Stopping WireGuard service...").ok();

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
            app_handle.emit_all("vpn-status-changed", VpnStatusPayload { connected: false }).ok();

            return Ok(());
        }

        let msg = format!("WireGuard error: {}", stderr.trim());
        append_log(&format!("Disconnect failed: {msg}")).ok();
        return Err(msg);
    }

    // Update state
    *state.connected.lock().unwrap() = false;
    app_handle.emit_all("vpn-status-changed", VpnStatusPayload { connected: false })
        .map_err(|e| format!("Failed to emit event: {e}"))?;

    append_log("Disconnect successful. Tunnel service removed.").ok();
    Ok(())
}

fn update_tray_menu(app: &AppHandle, ks_enabled: bool) {
    let item_handle = app.tray_handle().get_item("killswitch_toggle");
    if ks_enabled {
        let _ = item_handle.set_title("Disable Kill Switch (Restore Internet)");
        let _ = item_handle.set_selected(true);
    } else {
        let _ = item_handle.set_title("Enable Kill Switch");
        let _ = item_handle.set_selected(false);
    }
}

fn build_tray() -> SystemTray {
    let connect = CustomMenuItem::new("connect".to_string(), "Connect");
    let disconnect = CustomMenuItem::new("disconnect".to_string(), "Disconnect");
    let ks_toggle = CustomMenuItem::new("killswitch_toggle".to_string(), "Enable Kill Switch");
    let show = CustomMenuItem::new("show".to_string(), "Open App");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");

    let tray_menu = SystemTrayMenu::new()
        .add_item(connect)
        .add_item(disconnect)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(ks_toggle)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new()
        .with_menu(tray_menu)
        .with_icon(Icon::Raw(include_bytes!("../icons/icon.ico").to_vec()))
}

// --- Tauri Commands ---

#[tauri::command]
fn import_wireguard_config() -> Result<String, String> {
    let dest_path = nera_conf_path()?;

    let picked = FileDialogBuilder::new()
        .set_title("Select your WireGuard config (nera.conf)")
        .add_filter("WireGuard config", &["conf"])
        .pick_file();

    let Some(src) = picked else {
        append_log("Import config cancelled (no file selected).").ok();
        return Err("No file selected".to_string());
    };

    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Failed to copy config: {e}"))?;

    append_log(&format!(
        "Imported config from {} → {}",
        src.to_string_lossy(),
        dest_path.to_string_lossy()
    ))
    .ok();

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
fn connect_vpn(app: AppHandle, state: State<'_, VpnState>, server_key: Option<String>) -> Result<(), String> {
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
fn set_kill_switch(app: AppHandle, enabled: bool, state: State<'_, VpnState>) -> Result<(), String> {
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

    app.emit_all("kill-switch-changed", KillSwitchPayload { enabled })
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
    // 1. Generate New Keys
    let (priv_key, pub_key) = generate_keypair();

    // 2. Prepare API Request
    let client = reqwest::Client::new();
    let api_url = "http://45.76.106.63:3000/api/add-peer";
    
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert("x-api-key", HeaderValue::from_static("nera-secure-8829-tokyo-lock"));

    let body = serde_json::json!({
        "public_key": pub_key
    });

    // 3. Send Request
    let resp = client.post(api_url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Server error: {}", resp.status()));
    }

    let resp_data: AddPeerResponse = resp.json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // 4. Save to Settings
    let mut settings = load_settings();
    settings.private_key = priv_key;
    settings.public_key = pub_key;
    settings.device_ip = resp_data.allowed_ip.clone();
    save_settings(&settings);

    // 5. Return success message
    Ok(format!("Registered successfully. IP: {}", resp_data.allowed_ip))
}

#[tauri::command]
fn get_user_status() -> Option<String> {
    // Returns the current public key if valid, or None
    let settings = load_settings();
    if !settings.public_key.is_empty() && !settings.device_ip.is_empty() {
        Some(settings.public_key)
    } else {
        None
    }
}

// --- Main ---

fn main() {
    let system_tray = build_tray();

    // 1. Load Settings (Authoritative)
    let settings = load_settings();
    let ks_enabled = settings.kill_switch_enabled;

    // 2. Startup Logic
    if ks_enabled {
        // Recovery Mode
        if let Err(e) = enable_kill_switch_internal() {
             append_log(&format!("CRITICAL: Failed to apply kills switch on startup: {e}")).ok();
        } else {
            append_log("Startup: Kill Switch rules APPLIED. Internet blocked.").ok();
        }
    } else {
        // Safety Clean
        let _ = disable_kill_switch_internal(); 
    }

    tauri::Builder::default()
        .manage(VpnState { 
            connected: Mutex::new(false),
            kill_switch_enabled: Mutex::new(ks_enabled), 
        })
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(Vec::new()), 
        ))
        .invoke_handler(tauri::generate_handler![
            import_wireguard_config,
            connect_vpn,
            disconnect_vpn,
            read_logs,
            get_vpn_status,
            set_kill_switch,
            get_vpn_status,
            set_kill_switch,
            get_kill_switch_status,
            set_selected_server,
            get_selected_server,
            register_user_key,
            get_user_status,
        ])
        .system_tray(system_tray)
        .setup(move |app| {
            // Apply Tray State based on persistence
            if ks_enabled {
                update_tray_menu(&app.handle(), true);
            }
            // Do not force hide. Let frontend handle it based on preference.
            // if let Some(window) = app.get_window("main") {
            //     window.hide().ok();
            // }
            Ok(())
        })
        .on_system_tray_event(|app, event| match event {
             SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let visible = window.is_visible().unwrap_or(false);
                    if visible {
                         let _ = window.hide();
                    } else {
                         let _ = window.show();
                         let _ = window.set_focus();
                    }
                }
            }

            SystemTrayEvent::MenuItemClick { id, .. } => {
                let state = app.state::<VpnState>();
                match id.as_str() {
                    "connect" => {
                        // Tray connect uses last selected server
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
                        let _ = app.emit_all("kill-switch-changed", KillSwitchPayload { enabled: new_state });
                    }
                    "show" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        // On Quit, we do NOT disable KS if it was enabled, to persist protection?
                        // BUT user might want internet back.
                        // For a desktop app, "Quit" usually means "Close the app and stop doing your thing".
                        // If I quit Nera, I expect my internet to work. 
                        // If I reboot, I expect Nera to start and BLOCK.
                        // So Quit shoudl likely clean up. 
                        // But settings remain "true". So next boot -> blocked.
                        // Correct logic: Disable rules, but do NOT change saved setting.
						let _ = disable_kill_switch_internal();
                        let _ = disconnect_vpn_internal(app, &state);
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                 event.window().hide().ok();
                 api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::Exit => {
                // Global Cleanup on Exit
                let state = app_handle.state::<VpnState>();
                
                // 1. Ensure VPN is disconnected (kills WireGuard process)
                let _ = disconnect_vpn_internal(app_handle, &state);

                // 2. Ensure Kill Switch rules are removed (Safety net)
                // Note: If user wants persistent kill switch, we might NOT want this.
                // But for "closing the app restores internet", this is correct.
                // The persistent setting remains "true" in config, so on next boot it re-applies.
                let _ = disable_kill_switch_internal();
            }
            _ => {}
        });
}
