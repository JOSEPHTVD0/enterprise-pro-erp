# Novedades de la versión 0.5.9

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.9

Incluye todo lo publicado en `0.5.8` y dos correcciones importantes: el actualizador
**solo descarga** el instalador y se pueden abrir **varias instancias** con la misma base
de datos. Detalles: [docs/24](24-actualizacion-descarga-manual.md) y
[docs/25](25-instancias-y-pantalla-negra.md).

## Cambios

- **Actualizaciones sin instalación automática**: **Descargar instalador** valida el
  SHA-512 del feed y la firma fijada, guarda el `.exe` en `Descargas` y ofrece
  **Abrir carpeta**. Ya no existen `quitAndInstall`, el canal `update.instalar` ni el
  botón **Instalar y reiniciar**. `autoInstallOnAppQuit = false`.
- **Verificación de confianza adaptada**: `electron-updater` rechazaba el certificado
  autofirmado porque Windows devuelve `Status = 1` (raíz no confiable). El nuevo
  verificador acepta únicamente la huella
  `60B08EC13A4D8B0B5039A1F9698994D55312CD0C` y el asunto exacto
  `CN=Enterprise Pro ERP (autofirmado)`; cualquier otro firmante se rechaza.
- **Sin pantalla negra al reabrir**: se eliminó el lock de instancia única; el proceso
  principal recarga el renderer ante `did-fail-load`, crash o falta de respuesta; el
  botón **Recargar interfaz** usa el canal IPC `app:reload`; la rama de cambio
  obligatorio de contraseña deja un fondo visible.
- **Varias instancias simultáneas**: comparten `%APPDATA%\enterprise-pro-erp` y la BD.
  Un líder único ejecuta respaldos, VACUUM, exportaciones y búsqueda de actualizaciones.
  Entrar en una instancia ya no cierra la sesión de las demás. Restaurar un respaldo
  sigue exigiendo una sola instancia abierta.
- **Arranque concurrente seguro**: bloqueo temporal durante migraciones/siembra y
  transacciones `BEGIN IMMEDIATE`; WAL y `busy_timeout` se conservan.
- **SmartScreen no desaparece**: la firma sigue siendo autofirmada y sin timestamp.

## Seguridad

No cambian `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, el
`isTrusted` de los canales IPC, las políticas de sesión (30 min / 12 h), los permisos en
backend, las transacciones ni la auditoría. No hay emisión ni certificación DGII.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.9.exe` — 145.512.880 bytes.
- SHA-256: `4312509CC31F4DE7D995E720D7D96D5ACEB1CEAF37285696BE0942783CAAB162`.
- SHA-512: `dmxBD7dY4m40msjDEinnWOpfClwx4D7Slsj1XJ+49+UCro2Kmz2xMAjIfxQjwBzqd5ARcTqXYNsNQGzUobFCbw==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.9/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.9/EnterpriseProERP-Setup-0.5.9.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo. `Get-AuthenticodeSignature`
informa `Status: 1` por la raíz no confiable; es el caso esperado y es reconocido por el
verificador propio del actualizador.

El tag ligero `v0.5.9` se creó por GitHub API sobre el commit
`fe7b8a1c7ee90d470a5fdb47465519939e268c61`, el mismo HEAD remoto usado por `v0.5.8`. Como
en releases anteriores, no hay `git.exe` en el entorno y el código fuente 2026 continúa
en el árbol de trabajo local; la release contiene los artefactos compilados.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test`: 45 archivos, 314 pruebas.
- `npm.cmd run test:e2e`: 25/25.
- `npm.cmd run test:updater`: detectó `0.5.10` en un feed efímero, guardó el instalador
  en `ERP_DOWNLOADS_DIR` y no lo ejecutó.
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder y dos sesiones
  simultáneas.
- SHA-512 de `release/latest.yml` recalculado después de firmar; coincide con el `.exe`.
