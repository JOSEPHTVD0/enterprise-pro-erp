# Novedades de la versión 0.5.6

Publicada el 25 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.6

Esta versión mejora el panel de actualizaciones e incluye todo lo publicado en `0.5.5`.
El detalle técnico está en `docs/18-panel-actualizaciones-progreso.md`.

## Cambios

- **Pantalla de descarga**: porcentaje, bytes transferidos/totales y velocidad, con eventos
  `download-progress` de electron-updater enviados al renderer por `update.progreso`.
- **Instalación automática**: al terminar la descarga se llama a `quitAndInstall(false, true)`.
  El botón **Instalar y reiniciar** queda solo como reintento manual si falla la instalación.
  > **Sustituido después de `0.5.8`:** el actualizador ya no instala ni reinicia; solo
  > guarda el instalador en `Descargas`. Vea
  > [docs/24-actualizacion-descarga-manual.md](24-actualizacion-descarga-manual.md).
- **Última versión**: tras una búsqueda correcta sin cambios, el panel muestra de forma
  persistente «Está utilizando la última versión (X)».
- **Estado inmediato**: el proceso principal empuja `update.estado` además de mantener el
  sondeo de 60 s como respaldo.
- **Errores visibles**: fallos de descarga o instalación se muestran en el panel y permiten
  reintentar sin volver a buscar.

No cambian las políticas duras de seguridad (30 min de inactividad, 12 h absolutos,
5 intentos fallidos, `contextIsolation`, WAL/FK/auditoría e importes en centavos) ni la
autoridad de `buildContext`/`requirePermission` en el backend.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.6.exe` — 145.494.512 bytes.
- SHA-256: `9F7A39252871CC5BCDAA0174AF3448A9B8E3171A57B58EFA3B32A8862E5E1DC1`.
- SHA-512: `d4TxXvPopeKGULIVnSglJ1AeVW66IjxilxQuvf5kf4gMQqymIXN7I1FWUgU0F1PhQKAV+TeOi86sN0ziIfwg2A==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.6/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.6/EnterpriseProERP-Setup-0.5.6.exe.blockmap

El instalador está firmado con el certificado autofirmado `CN=Enterprise Pro ERP
(autofirmado)` (huella SHA-1 `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`), sin timestamp.
SmartScreen permanece hasta usar un certificado de una CA pública.

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 40 archivos, 259 pruebas.
- `npm run test:e2e`: 19/19.
- `npm run test:updater`: detectó `0.5.7` desde un feed local con la `0.5.6` instalada.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Las tres URLs públicas responden HTTP 200 y el `latest.yml` publicado coincide con
  `release/latest.yml`.
