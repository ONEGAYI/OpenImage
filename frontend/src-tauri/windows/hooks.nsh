; NSIS Installer Hooks — OpenImage
;
; PREINSTALL: Kill backend sidecar before (re)install
; PREUNINSTALL: Kill sidecar + ask user about data preservation
; POSTUNINSTALL: Restore preserved data to install directory

!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
  Sleep 500
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Kill backend sidecar
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'
  Sleep 500
  nsExec::ExecToLog 'taskkill /F /T /IM "openimage-backend.exe"'

  ; Ask user about data preservation
  IfFileExists "$INSTDIR\data" 0 no_data
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "检测到用户数据（图片、设置等）。$\n$\n卸载时是否保留？" \
      /SD IDYES IDYES keep_data IDNO delete_data

    keep_data:
      ; Move data to sibling directory outside uninstall scope
      nsExec::ExecToLog 'xcopy "$INSTDIR\data" "$INSTDIR\..\OpenImageData" /E /I /Q /Y'
      RMDir /r "$INSTDIR\data"
      Goto data_done

    delete_data:
      RMDir /r "$INSTDIR\data"

    data_done:
  no_data:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Restore preserved data back to install directory for future reinstall
  IfFileExists "$INSTDIR\..\OpenImageData" 0 no_backup
    CreateDirectory "$INSTDIR"
    nsExec::ExecToLog 'xcopy "$INSTDIR\..\OpenImageData" "$INSTDIR\data" /E /I /Q /Y'
    RMDir /r "$INSTDIR\..\OpenImageData"
  no_backup:
!macroend
