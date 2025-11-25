#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::Command,
};

use tauri::{
    api::{
        dialog::blocking::FileDialogBuilder,
        path::document_dir,
    },
    CustomMenuItem,
    Manager,
    SystemTray,
    SystemTrayEvent,
    SystemTrayMenu,
    SystemTrayMenuItem,
};
use tauri_plugin_autostart::MacosLauncher;

const WIREGUARD_EXE: &str = r"C:\Program Files\WireGuard\wireguard.exe";
// This should match the name of your config file WITHOUT ".conf"
const TUNNEL_NAME: &str = "nera";

fn nera_conf_path() -> Result<PathBuf, String> {
    document_dir()
        .map(|mut dir| {
            // Standardize on: C:\Users\<you>\Documents\nera.conf
            dir.push("nera.conf");
            dir
        })
        .ok_or_else(|| "Could not find the Documents folder on this system.".to_string())
}

/// Logs directory: Documents/NeraVPN
fn log_dir() -> Result<PathBuf, String> {
    let mut dir = document_dir().ok_or_else(|| "Could not find Documents folder.".to_string())?;
    dir.push("NeraVPN");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create log directory: {e}"))?;
    }
    Ok(dir)
}

/// Logs file: Documents/NeraVPN/nera.log
fn log_file_path() -> Result<PathBuf, String> {
    let mut path = log_dir()?;
    path.push("nera.log");
    Ok(path)
}

/// Append a line to the log file with timestamp.
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
fn connect_vpn() -> Result<(), String> {
    let conf_path = nera_conf_path()?;

    if !conf_path.exists() {
        let msg = format!(
            "Config not found at {}. Click \"Import Config\" first.",
            conf_path.to_string_lossy()
        );
        append_log(&format!("Connect requested but config missing: {}", msg)).ok();
        return Err(msg);
    }

    append_log("Connect requested. Launching WireGuard...").ok();

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

    append_log("Connect successful. Tunnel service installed.").ok();
    Ok(())
}

#[tauri::command]
fn disconnect_vpn() -> Result<(), String> {
    append_log("Disconnect requested. Stopping WireGuard service...").ok();

    let output = Command::new(WIREGUARD_EXE)
        .arg("/uninstalltunnelservice")
        .arg(TUNNEL_NAME)
        .output()
        .map_err(|e| format!("Failed to stop WireGuard: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        // If the service isn't there, treat it as "already disconnected"
        if stderr
            .to_lowercase()
            .contains("the specified service does not exist as an installed service")
        {
            append_log("Disconnect: service not found (already stopped).").ok();
            return Ok(());
        }

        let msg = format!("WireGuard error: {}", stderr.trim());
        append_log(&format!("Disconnect failed: {msg}")).ok();
        return Err(msg);
    }

    append_log("Disconnect successful. Tunnel service removed.").ok();
    Ok(())
}

#[tauri::command]
fn read_logs() -> Result<String, String> {
    let path = log_file_path()?;
    if !path.exists() {
        return Ok("No logs yet.".to_string());
    }
    fs::read_to_string(path).map_err(|e| format!("Failed to read logs: {e}"))
}

fn build_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "Show Nera VPN");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

fn main() {
    let system_tray = build_tray();

    tauri::Builder::default()
        // Cross-platform autostart plugin
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(Vec::new()), // no extra CLI args
        ))
        .invoke_handler(tauri::generate_handler![
            import_wireguard_config,
            connect_vpn,
            disconnect_vpn,
            read_logs,
        ])
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            // Left-click toggles show/hide
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
            // Tray menu items
            SystemTrayEvent::MenuItemClick { id, .. } => {
                if let Some(window) = app.get_window("main") {
                    match id.as_str() {
                        "show" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        "hide" => {
                            let _ = window.hide();
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        })
        // Hitting X hides to tray instead of quitting
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                event.window().hide().ok();
                api.prevent_close();
            }
        })
        // NEW: start minimized to tray
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                // Hide on startup so on boot it just lives in the tray
                window.hide().ok();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
