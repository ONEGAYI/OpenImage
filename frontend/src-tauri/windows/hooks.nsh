; NSIS Installer Hooks — OpenImage
; Tauri's built-in CheckIfAppIsRunning only handles the main process
; The backend sidecar (OpenImage-Backend.exe) must be terminated manually

!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM "OpenImage-Backend.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM "OpenImage-Backend.exe"'
!macroend
