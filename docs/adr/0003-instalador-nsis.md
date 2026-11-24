# ADR-0003 — Instalador NSIS con prebuilds de better-sqlite3 (aprobado en Fase 12)

- **Estado:** Aceptado. El propietario autorizó la Fase 12 y, con ella, la instalación de
  `electron-builder`, único añadido al toolchain.
- **Contexto:** El plan aprobado incluía un instalador Windows NSIS. La aplicación usa
  `better-sqlite3@13.2.0`, módulo nativo compilado con Node-API (`NAPI_VERSION=10` en
  `binding.gyp`). El arranque real debía funcionar sin añadir `electron-rebuild` ni cambiar la
  lógica de la app, y la desinstalación debía preguntar por los datos.
- **Decisión:**
  1. Instalar `electron-builder@26.18.0` como dependencia de desarrollo y añadir el script
     `dist:win` (`npm run build && electron-builder --win --x64`).
  2. Configurar NSIS `perMachine: false`, sin one-click, con carpeta configurable, accesos
     directos de escritorio y menú, `productName` e `appId` propios, e icono original en
     `build/icon.ico`.
  3. Usar `asarUnpack: ["**/node_modules/better-sqlite3/**/*"]` y `npmRebuild:false`. Los
     prebuilds Node-API del módulo son compatibles con Electron 37.10.3 y se verificaron
     ejecutando el exe instalado; no se añadió `electron-rebuild`.
  4. Añadir `build/installer.nsh` con un `customUnInstall` que pregunta Sí/No antes de borrar
     `%APPDATA%\enterprise-pro-erp`, omitiendo la pregunta cuando `${isUpdated}` es verdadero.
- **Motivo:** Mantener el stack aprobado, evitar una herramienta de rebuild adicional y hacer
  explícita la decisión del usuario sobre sus datos. Los datos viven en `userData`, no en la
  carpeta del programa, por lo que actualizar no los afecta.
- **Consecuencias:**
  - En la Fase 12 el instalador quedó sin firmar y sin actualización automática. Ambos puntos
    se cerraron después con autorización: firma autofirmada y `electron-updater` con feed;
    véase [ADR-0004](0004-cierre-limitaciones.md). SmartScreen no desaparece sin CA confiable.
    No se afirma certificación DGII.
  - Instalar `electron-builder` elevó el número de avisos de `npm audit` en dependencias de
    desarrollo; `npm audit --omit=dev` quedó en **0** tras las correcciones de Zod/uuid
    documentadas en ADR-0004. Los 11 avisos de desarrollo exigen cambios mayores no aplicados.
  - Al actualizar Electron o `better-sqlite3` hay que repetir la verificación del exe
    instalado (BD creada e `integrity_check` = `ok`).
  - Desinstalar en modo silencioso conserva los datos por defecto (`/SD IDNO`).
- **Verificación:** instalación silenciosa, arranque CDP del exe instalado con perfil aislado
  (versión 0.2.0, Electron 37.10.3, SQLite íntegro, sin errores propios), y prueba de las dos
  ramas del desinstalador con un centinela. Evidencia en
  `C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase12-result.json` y
  `C:\Users\ferre\AppData\Local\Temp\opencode\desinstalacion-fase12-result.json`.
