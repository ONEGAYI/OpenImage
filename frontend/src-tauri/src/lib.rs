use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct Backend(Mutex<Option<CommandChild>>);

const BACKEND_PORT: u16 = 8765;
#[cfg(target_os = "windows")]
const BACKEND_PROCESS: &str = "openimage-backend.exe";

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

            let data_dir = std::env::current_exe()?
                .parent()
                .expect("executable has no parent directory")
                .to_path_buf();
            std::fs::create_dir_all(&data_dir)?;

            let data_dir_str = data_dir.to_string_lossy().to_string();

            // Heavy work in background so the window shows the loading screen immediately.
            tauri::async_runtime::spawn(async move {
                #[cfg(target_os = "windows")]
                {
                    let output = std::process::Command::new("taskkill")
                        .args(["/F", "/T", "/IM", BACKEND_PROCESS])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                    if output.as_ref().map(|o| o.status.success()).unwrap_or(false) {
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }

                let sidecar = app_handle
                    .shell()
                    .sidecar("openimage-backend")
                    .expect("Failed to resolve openimage-backend sidecar")
                    .args(["--base-dir", &data_dir_str]);

                let (mut rx, child) = sidecar.spawn().expect("Failed to spawn backend sidecar");

                app_handle
                    .state::<Backend>()
                    .0
                    .lock()
                    .unwrap()
                    .replace(child);

                let healthy = Arc::new(AtomicBool::new(false));

                let log_handle = app_handle.clone();
                let healthy_flag = healthy.clone();
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
                                if !healthy_flag.load(Ordering::Relaxed) {
                                    let _ = log_handle.emit("backend-error", "Backend process exited unexpectedly");
                                }
                                break;
                            }
                            CommandEvent::Error(err) => {
                                eprintln!("[backend] error: {}", err);
                                if !healthy_flag.load(Ordering::Relaxed) {
                                    let _ = log_handle.emit("backend-error", "Backend error");
                                }
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                let health_handle = app_handle.clone();
                let healthy_flag2 = healthy.clone();
                tauri::async_runtime::spawn(async move {
                    let url = format!("http://127.0.0.1:{}/api/settings", BACKEND_PORT);
                    let client = reqwest::Client::builder()
                        .timeout(Duration::from_secs(2))
                        .build()
                        .unwrap();

                    for attempt in 0..150 {
                        if attempt > 0 {
                            tokio::time::sleep(Duration::from_millis(200)).await;
                        }
                        match client.get(&url).send().await {
                            Ok(_) => {
                                println!("[backend] healthy after {} attempts", attempt + 1);
                                healthy_flag2.store(true, Ordering::Relaxed);
                                health_handle.emit("backend-ready", ()).ok();
                                return;
                            }
                            Err(_) => {
                                println!("[backend] waiting... attempt {}", attempt + 1);
                            }
                        }
                    }
                    eprintln!("[backend] failed to start within 30s");
                    let _ = health_handle.emit("backend-error", "Backend failed to start within 30 seconds");
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::Exit | RunEvent::ExitRequested { .. } => {
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
                    .args(["/F", "/T", "/IM", BACKEND_PROCESS])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
            _ => {}
        });
}
