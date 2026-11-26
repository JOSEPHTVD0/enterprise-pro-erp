# Panel de actualizaciones con progreso y descarga local

> El panel se publicó originalmente en `0.5.6` con instalación automática. Ese
> comportamiento fue sustituido: consulte
> [docs/24-actualizacion-descarga-manual.md](24-actualizacion-descarga-manual.md).
> La sección «Artefactos publicados» al final corresponde a la release histórica `0.5.6`.

## Comportamiento actual

- Al pulsar **Descargar instalador**, el panel muestra una pantalla de descarga con
  porcentaje, bytes transferidos, total y velocidad.
- El proceso principal emite `update.progreso` con los eventos `download-progress` de
  electron-updater, normalizados a porcentaje/bytes. El servicio envía `0 %` al iniciar
  y `100 %` al terminar aunque el proveedor no emita eventos.
- Al terminar, el instalador se copia a la carpeta `Descargas` del usuario (o a
  `ERP_DOWNLOADS_DIR`) y el panel muestra la ruta absoluta junto al botón
  **Abrir carpeta**. No se ejecuta ni se reinicia la aplicación.
- `autoDownload = false` y `autoInstallOnAppQuit = false`. Aunque la preferencia
  **Descarga automática** esté activa, el servicio solo guarda el archivo; la
  instalación siempre la decide el usuario.
- Si la comprobación termina sin versión nueva, el panel muestra de forma persistente
  «Está utilizando la última versión (X)» y el toast confirma lo mismo.
- Los errores de búsqueda o descarga se muestran en el panel sin borrar el instalador
  que ya hubiera guardado.

## Implementación

- `src/shared/actualizaciones.ts`: `ProgresoDescarga`, `verificado`, `rutaInstalador`;
  se eliminó el método `instalar` del contrato.
- `src/main/services/updater.service.ts`: escucha `download-progress`, sustituye la
  verificación de firma, guarda el instalador en `Descargas` sin sobrescribir y notifica
  estado/progreso mediante callbacks inyectados.
- `src/main/services/firma-instalador.ts`: acepta solo la huella del certificado
  autofirmado propio, porque Windows rechaza su raíz no confiable.
- `src/main/index.ts`: reenvía `update.estado` y `update.progreso`, define la carpeta
  destino y abre el Explorador con `shell.showItemInFolder`.
- Canales IPC: `update.estado`, `update.verificar`, `update.descargar`,
  `update.abrirCarpeta`. No existe `update.instalar`.
- `src/renderer/src/features/actualizaciones/UpdateControls.tsx`: pantalla de progreso,
  ruta guardada y acceso a la carpeta; sin botón **Instalar y reiniciar**.

## Artefactos publicados en 0.5.6 (histórico)

- Instalador: `EnterpriseProERP-Setup-0.5.6.exe` — 145.494.512 bytes.
- SHA-256: `9F7A39252871CC5BCDAA0174AF3448A9B8E3171A57B58EFA3B32A8862E5E1DC1`.
- SHA-512: `d4TxXvPopeKGULIVnSglJ1AeVW66IjxilxQuvf5kf4gMQqymIXN7I1FWUgU0F1PhQKAV+TeOi86sN0ziIfwg2A==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.6/latest.yml
