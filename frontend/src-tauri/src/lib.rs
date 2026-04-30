use std::sync::Mutex;
use std::time::Duration;

use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct Backend(Mutex<Option<CommandChild>>);

const BACKEND_PORT: u16 = 8765;

#[tauri::command]
fn backend_url() -> String {
    format!("http://127.0.0.1:{}", BACKEND_PORT)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Backend(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![backend_url])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Resolve user data directory
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // Spawn the sidecar backend process
            let sidecar = app
                .shell()
                .sidecar("openimage-backend")
                .expect("Failed to resolve openimage-backend sidecar")
                .args(["--base-dir", &data_dir.to_string_lossy()]);

            let (mut rx, child) = sidecar.spawn().expect("Failed to spawn backend sidecar");

            // Store child handle for cleanup on exit
            app.state::<Backend>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            // Log sidecar output
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("[backend] exited: {:?}", status);
                            break;
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[backend] error: {}", err);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // Health check: poll until backend responds
            let health_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let url = format!("http://127.0.0.1:{}/api/settings", BACKEND_PORT);
                let client = reqwest::Client::builder()
                    .timeout(Duration::from_secs(2))
                    .build()
                    .unwrap();

                for attempt in 0..60 {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    match client.get(&url).send().await {
                        Ok(_) => {
                            println!("[backend] healthy after {} attempts", attempt + 1);
                            health_handle.emit("backend-ready", ()).ok();
                            return;
                        }
                        Err(_) => {
                            println!("[backend] waiting... attempt {}", attempt + 1);
                        }
                    }
                }
                eprintln!("[backend] failed to start within 30 seconds");
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::Exit | RunEvent::ExitRequested { .. } => {
                // Kill CommandChild handle (bootloader process)
                if let Some(backend) = app_handle.try_state::<Backend>() {
                    if let Ok(mut guard) = backend.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
                // PyInstaller onefile creates bootloader + Python subprocess;
                // child.kill() only hits the bootloader — taskkill /T cleans the tree.
                #[cfg(target_os = "windows")]
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/IM", "openimage-backend.exe"])
                    .spawn();
            }
            _ => {}
        });
}
