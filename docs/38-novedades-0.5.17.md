# Novedades de la versión 0.5.17

> Release publicada: **`v0.5.17`** (tag `v0.5.17`), con **57 archivos / 390
> pruebas** y **33/33 E2E** en Electron por CDP.
> Release: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.17

Publicada el 27 de noviembre de 2026 con autorización explícita. Incluye todo lo publicado
en `v0.5.16` y añade dos lotes verificados: el estado «actualizado» del panel de
actualizaciones con bloqueo de descarga, y los usuarios operativos semilla con paneles
separados según permiso. Detalles complementarios:
[18-panel-actualizaciones-progreso.md](18-panel-actualizaciones-progreso.md) y
[24-actualizacion-descarga-manual.md](24-actualizacion-descarga-manual.md).

## Cambios incluidos

### Actualizaciones: «Está actualizado» y ninguna descarga

- `EstadoActualizacion` incorpora el estado `actualizado`. Cuando la comprobación no
  encuentra versión nueva, el panel muestra de forma persistente «Está actualizado en la
  versión X. No hay descargas disponibles» y el botón queda deshabilitado como
  **Sin descargas**.
- El proceso principal rechaza `update.descargar` en ese estado, aunque se invoque
  directamente por IPC; el mensaje de error es el mismo que ve el usuario.
- Cuando sí hay versión nueva, el panel ofrece **Descargar instalador**, guarda el `.exe`
  en `Descargas` (o `ERP_DOWNLOADS_DIR`) y aclara que la instalación es manual. El
  programa nunca ejecuta el instalador ni reinicia: no existe `update.instalar`.

### Usuarios operativos y paneles separados por permiso

- Dos usuarios semilla nuevos, además de `admin`:

  | Usuario | Contraseña inicial | Rol | Permisos efectivos |
  |---------|--------------------|-----|--------------------|
  | `facturador` | `Factura1234!` | `Facturador` | consultar/crear/imprimir/exportar Ventas y consultar Clientes, Productos e Inventario |
  | `cobrador` | `Cobros1234!` | `Cobrador` | consultar/crear/anular/imprimir/exportar Cobros |

- Los tres usuarios deben cambiar la contraseña en el primer ingreso. Los usuarios
  semilla no se recrean ni se reestablecen en arranques posteriores: si ya existen, se
  conservan la contraseña y las asignaciones hechas por el administrador.
- `facturador` entra en **Facturación** y no ve **Cobros** ni **Panel comercial**.
  `cobrador` entra en **Cobros** y no ve **Facturación** ni **Panel comercial**.
  `admin` conserva ambos paneles y el acceso total.
- La separación no depende de ocultar botones por nombre de usuario: usan los permisos
  reales de los módulos (`ventas.consultar`, `cobros.consultar`, `reportes.consultar`),
  verificados otra vez en el proceso principal antes de cada operación. El nombre de
  usuario solo elige la vista inicial.
- Los roles `Facturador` y `Cobrador` se añaden al catálogo del sistema y, como
  `Administrador`, `Gerente` y `Vendedor`, no se pueden eliminar desde el centro de
  control.
- Cobros consulta sus propios catálogos de clientes y documentos sin necesidad de
  permiso `cxc.consultar`; el área sigue siendo independiente de Ventas.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: **390/390** pruebas en **57 archivos**.
- `npm.cmd run test:e2e`: **33/33** pruebas reales en Electron por CDP, incluidos los
  dos nuevos perfiles y la ausencia de los paneles ajenos; sin errores de consola
  inesperados.
- `npm.cmd run test:updater`: detectó `0.5.18` desde un feed efímero y guardó el
  instalador en `Descargas` sin ejecutarlo.
- `npm.cmd run test:instancias`: dos procesos activos sobre la misma BD, un solo líder
  y dos sesiones simultáneas.
- `npm.cmd run dist:win`: NSIS x64 firmado, con `app.asar`, módulo nativo
  desempaquetado, desinstalador y blockmap.
- `npm.cmd run release:feed`: `latest.yml` regenerado tras la firma; su SHA-512 coincide
  con el instalador publicado y la copia del feed es byte a byte igual al artefacto.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.17.exe` — 145.564.248 bytes.
- SHA-256: `FB713E688D7CE49D6EC80761F191B031B79C459D8C8D559514FDCD77B9E98CE4`.
- SHA-512 (hex):
  `92DAC6C185B74DFB215929CF30E64E52EA53DBBFA36D3EBAD3CB24554898D74791C88C92FA999AAC878A857312112B67ABE5AF27451DB2925B4668A3B81BF630`.
- SHA-512 (base64, `release/latest.yml`):
  `ktrGwYW3TfshWSnPMOZOUupT27+jbT6608skVUiY10eRyIyS+pmarIeKhXMSEStnq+WvJ0UdspJbRmijuBv2MA==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.17/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.17/EnterpriseProERP-Setup-0.5.17.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo.
`Get-AuthenticodeSignature` informa `UnknownError` («termina en un certificado de raíz
no compatible con el proveedor de confianza»), el caso esperado con un certificado
autofirmado. SmartScreen no desaparece sin una CA pública.

## Límites que permanecen

- DGI sigue siendo solo rotulado/configuración visual: no emite, exporta ni simula e-CF;
  no hay envío a DGII ni certificación fiscal.
- Los borradores de facturación viven en `localStorage`; los comprobantes emitidos son
  inmutables y se anulan o reversan con trazabilidad.
- No se ha modificado el rediseño del panel ECF publicado en `v0.5.13`.
- El modo de impresión por defecto continúa siendo `DIALOGO`; `SILENCIOSA` es opcional y
  se configura por documento o estación.
