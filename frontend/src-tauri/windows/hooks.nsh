; NSIS Installer Hooks — OpenImage
; Tauri's built-in CheckIfAppIsRunning only handles the main process.
; The backend sidecar (openimage-backend.exe) must be terminated manually.
; PyInstaller onefile spawns bootloader + Python subprocess — retry ensures cleanup.

!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
  Sleep 500
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
  Sleep 500
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
!macroend
