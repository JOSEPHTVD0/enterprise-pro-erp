; Personalización NSIS de ENTERPRISE PRO ERP.
; El instalador usa el script seguro de electron-builder; aquí solo se añade la
; decisión explícita del usuario sobre sus datos locales al desinstalar.

!macro customUnInstall
  ; Durante una actualización el desinstalador se ejecuta automáticamente: no se pregunta.
  ${ifNot} ${isUpdated}
    SetShellVarContext current
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "¿Desea eliminar también los datos locales de ENTERPRISE PRO ERP?$\r$\n$\r$\nEsto incluye la base de datos, los respaldos y las preferencias guardados en %APPDATA%\\enterprise-pro-erp.$\r$\nSi selecciona No, conservará toda su información." \
      /SD IDNO IDNO conservarDatos IDYES eliminarDatos

    eliminarDatos:
      RMDir /r "$APPDATA\enterprise-pro-erp"
      Goto finDatos
    conservarDatos:
    finDatos:
  ${endIf}
!macroend

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Desinstalar ENTERPRISE PRO ERP"
  !define MUI_UNWELCOMEPAGE_TEXT "Se retirará la aplicación. En la siguiente pantalla podrá decidir si desea conservar o eliminar sus datos locales."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
