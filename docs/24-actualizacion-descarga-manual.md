# Actualizaciones: solo descarga local e instalación manual

Publicado en `0.5.9`:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.9

## Motivo

El instalador publicado está firmado con un certificado autofirmado
(`CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`). La verificación Authenticode que hace
`electron-updater` por defecto exige `Status = 0` (cadena confiable para Windows); con
este certificado Windows devuelve `Status = 1` y la descarga se rechaza antes de poderse
guardar.

## Comportamiento actual

- **Buscar** sigue consultando el feed y aplicando el filtro de canal `ESTABLE`/`BETA`.
- **Descargar instalador** valida el SHA-512 de `latest.yml`, comprueba que el firmante
  sea exactamente nuestro certificado autofirmado y copia el `.exe` a la carpeta
  `Descargas` del usuario (o a `ERP_DOWNLOADS_DIR`, si se define en el proceso principal).
- **Nunca** se llama a `quitAndInstall`. `autoDownload = false` y
  `autoInstallOnAppQuit = false`, tanto en descarga manual como en
  `descargaAutomatica`.
- Si ya existe un archivo con el mismo nombre, se guarda con un sufijo `-1`, `-2`, …
  en lugar de sobrescribirlo.
- El panel muestra la ruta absoluta del instalador y ofrece **Abrir carpeta**.
  La instalación la ejecuta el usuario desde el Explorador.
- Los canales IPC son `update.estado`, `update.verificar`, `update.descargar` y
  `update.abrirCarpeta`. **No existe `update.instalar`**. Todos siguen protegidos por
  `isTrusted`.
- Windows SmartScreen seguirá avisando mientras no haya certificado de CA pública.
  El usuario debe elegir «Más información» → «Ejecutar de todos modos».

## Confianza

La validación por defecto se sustituye por `src/main/services/firma-instalador.ts`:
acepta únicamente la huella fijada y el asunto exacto esperado; cualquier otro
certificado se rechaza. El SHA-512 del feed sigue siendo validado por
`electron-updater` antes de copiar el archivo. La raíz de confianza pasa a ser
«feed HTTPS + hash publicado + huella fijada», no una CA pública de Windows.

## Archivos implicados

- `src/main/services/firma-instalador.ts` (nuevo).
- `src/main/services/updater.service.ts`: descarga, copia a `Descargas`, sin instalación.
- `src/main/index.ts`: carpeta destino y `shell.showItemInFolder`.
- `src/shared/actualizaciones.ts`: `rutaInstalador`, sin método `instalar`.
- `src/renderer/src/lib/actualizaciones.ts`,
  `src/renderer/src/features/actualizaciones/UpdateControls.tsx`,
  `src/renderer/src/app/Topbar.tsx` y
  `src/renderer/src/features/configuracion/ConfiguracionAvanzadaPage.tsx`.
- `tests/unit/actualizaciones.test.ts`, `tests/unit/firma-instalador.test.ts`,
  `tests/e2e/app.spec.ts` y `scripts/verificar-updater.mjs`.

## Verificación local

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test`: 43 archivos, 309 pruebas.
- `npm.cmd run test:e2e`: 25/25.
- `npm.cmd run test:updater`: detectó `0.5.10` desde el feed efímero y guardó el
  instalador en `ERP_DOWNLOADS_DIR`; el contenido coincide byte a byte con el publicado
  y no se ejecuta ningún instalador.
