#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

mod providers;
mod rig_server;
mod modules;

struct BackendProcess(Mutex<Option<Child>>);

fn resolve_backend_dir(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        let base_dir = std::env::current_dir().ok()?;
        return Some(base_dir.join("backend"));
    }
    app_handle
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("backend"))
}

fn spawn_legacy_backend(
    app_handle: &tauri::AppHandle,
    host: &str,
    node_port: u16,
    frontend_urls: &str,
) -> Option<Child> {
    let backend_dir = match resolve_backend_dir(app_handle) {
        Some(dir) => dir,
        None => {
            eprintln!("Backend directory not found; skipping backend startup.");
            return None;
        }
    };

    let mut cmd = Command::new("node");
    if cfg!(debug_assertions) {
        cmd.arg("--watch");
    }
    cmd.arg("src/server.js");
    cmd.current_dir(backend_dir);
    cmd.env("HOST", host);
    cmd.env("PORT", node_port.to_string());
    cmd.env("FRONTEND_URLS", frontend_urls);
    cmd.stdout(Stdio::inherit());
    cmd.stderr(Stdio::inherit());

    match cmd.spawn() {
        Ok(child) => Some(child),
        Err(err) => {
            eprintln!("Failed to start backend process: {err}");
            None
        }
    }
}

fn spawn_rig_backend(host: String, port: u16, node_port: u16, frontend_urls: String) {
    let node_base = format!("http://{}:{}", host, node_port);
    let allowed_origins = frontend_urls
        .split(',')
        .map(|origin| origin.trim().to_string())
        .filter(|origin| !origin.is_empty())
        .collect::<Vec<_>>();

    tauri::async_runtime::spawn(async move {
        if let Err(err) = rig_server::serve(rig_server::RigServerConfig {
            host,
            port,
            node_base,
            allowed_origins,
        })
        .await
        {
            eprintln!("Rig backend failed: {err}");
        }
    });
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let (host, port) = resolve_rig_host_and_port();
            let node_port = std::env::var("NODE_BACKEND_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(3002);
            let frontend_urls = std::env::var("FRONTEND_URLS")
                .unwrap_or_else(|_| "tauri://localhost,http://127.0.0.1:3000,http://localhost:3000".to_string());

            spawn_rig_backend(host.clone(), port, node_port, frontend_urls.clone());
            let child = spawn_legacy_backend(&app.handle(), &host, node_port, &frontend_urls);
            app.manage(BackendProcess(Mutex::new(child)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let state = app_handle.state::<BackendProcess>();
            if let Ok(mut guard) = state.0.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                }
            };
        }
    });
}

fn resolve_rig_host_and_port() -> (String, u16) {
    let host_env = std::env::var("HOST").ok();
    let port_env = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok());
    if let (Some(host), Some(port)) = (host_env.clone(), port_env) {
        return (host, port);
    }

    if let Ok(public_url) = std::env::var("PUBLIC_BACKEND_URL") {
        if let Some((host, port)) = parse_host_port_from_url(&public_url) {
            return (host, port);
        }
    }

    (
        host_env.unwrap_or_else(|| "127.0.0.1".to_string()),
        port_env.unwrap_or(3001),
    )
}

fn parse_host_port_from_url(raw: &str) -> Option<(String, u16)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let without_scheme = trimmed
        .strip_prefix("http://")
        .or_else(|| trimmed.strip_prefix("https://"))
        .unwrap_or(trimmed);
    let host_port = without_scheme.split('/').next()?.trim();
    if host_port.is_empty() {
        return None;
    }

    let mut parts = host_port.split(':');
    let host = parts.next()?.trim().to_string();
    let port = parts
        .next()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3001);

    if host.is_empty() {
        None
    } else {
        Some((host, port))
    }
}
