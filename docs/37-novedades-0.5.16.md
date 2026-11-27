# Novedades de la versión 0.5.16

> Release publicada: **`v0.5.16`** (tag `v0.5.16`), con **56 archivos / 386
> pruebas** y **31/31 E2E** en Electron por CDP.
> Release: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.16

Publicada el 27 de noviembre de 2026 con autorización explícita. Incluye todo lo publicado en
`v0.5.15` y añade dos lotes verificados: consistencia de interfaz/ajustes e IPC/impresión, y el
tablero horizontal avanzado. Detalles complementarios:
[35-consistencia-ui-ajustes.md](35-consistencia-ui-ajustes.md) y
[36-panel-horizontal-avanzado.md](36-panel-horizontal-avanzado.md).

## Cambios incluidos

### Consistencia de interfaz, ajustes e IPC

- Primitivos `Skeleton`, `SkeletonChart`, `EmptyState`, `LoadingState` y `StatCard`, con
  `DataTable` con estado `loading`, `aria-busy` y orden/paginación accesibles.
- `Modal`, `Tabs`, `Toast`, `CommandPalette`, `Field`, `TextInput` y `NumberInput` refuerzan
  etiquetas, descripciones, trampa de foco y anuncios para lectores de pantalla.
- El acento de la interfaz sale únicamente de `--erp-acento`; la escala de fuente, el idioma
  del marco y el formato de dinero/fecha respetan las preferencias persistidas.
- Libros 606/607, `fiscal.recordatorioNcf`, `panel.verCostos`, `panel.verSalud`, flags vigentes
  y las 41 vistas de `vistasPersonalizables` consumen la configuración real; guardar o
  restaurar ajustes recarga las preferencias globales.
- `impresion.listar()` falla de forma segura y muestra el error; la espera del área de impresión
  usa `MutationObserver`/`requestAnimationFrame` con topes; `route()` valida los defaults Zod
  cuando `payload.input` está ausente sin exponer el token a los servicios.
- Las exportaciones reales escriben auditoría `EXPORTAR`; un rechazo por permiso no genera
  auditoría. Los canales heredados conservan permiso y validación.

### Tablero horizontal avanzado

- Nueva pestaña **Panel horizontal** al final de Espacio de trabajo, sin añadir módulos de
  primer nivel ni modificar el rediseño de `FacturacionEcfPanel` publicado en `v0.5.13`.
- Un único canal de solo lectura `panel.horizontal.resumen`, con `panelHorizontalFiltroSchema`
  (Zod) y resolución de permisos por sección en el proceso principal.
- Cinco paneles sobre SQLite real: cola de cobranza, ranking ABC de inventario, agenda de
  servicios/CRM, desviación presupuestaria y cuadre de caja/banca.
- Filtros `desde`/`hasta`/`texto`/`limite`/`soloUrgentes`, actualización, reordenación,
  colapso persistido y exportación CSV desde los datos visibles.
- Las secciones sin permiso se devuelven como `null` con su motivo; nunca se filtran datos al
  renderer. No se crean permisos nuevos ni auditoría adicional porque el tablero no escribe.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: **386/386** pruebas en **56 archivos**.
- `npm.cmd run test:e2e`: **31/31** pruebas reales en Electron por CDP, sin errores de
  consola inesperados.
- `npm.cmd run test:updater` y `npm.cmd run test:instancias`: correctos sobre el feed local.
- `npm.cmd run dist:win`: NSIS x64 generado con `app.asar`, módulo nativo desempaquetado,
  icono, desinstalador y blockmap.
- `npm.cmd run release:feed`: `latest.yml` regenerado tras la firma; su SHA-512 coincide con
  el instalador publicado.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.16.exe` — 145.563.768 bytes.
- SHA-256: `CCB0EE11CD5DA3B32DB37F5DD227F34473732A49DEE3D4284B671606A927A33F`.
- SHA-512 (hex):
  `252828FE5E648B3D817105AE5663D061850871E48D3998DFC8C51595C6C0940A1814BDAC8338A669098FE90F3D4787B23CDB138AD9219DA4C4372C4631C32B5F`.
- SHA-512 (base64, `release/latest.yml`):
  `JSgo/l5kiz2BcQWuVmPQYYUIceSNOZjfyMUVlcbAlAoYFL2sgzimaQmP6Q89R4eyPNsTitkhnaTENyxGMcMrXw==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.16/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.16/EnterpriseProERP-Setup-0.5.16.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo. `Get-AuthenticodeSignature`
informa `UnknownError` («termina en un certificado de raíz no compatible con el proveedor de
confianza»), el caso esperado con un certificado autofirmado. SmartScreen no desaparece sin
una CA pública.

## Límites que permanecen

- DGI sigue siendo solo rotulado/configuración visual: no emite, exporta ni simula e-CF; no
  hay envío a DGII ni certificación fiscal.
- `PREPARACION_E_CF` es informativo. Los libros 606/607 son borradores locales derivados de
  documentos reales.
- Los borradores de facturación viven en `localStorage`; los comprobantes emitidos son
  inmutables y se anulan o reversan con trazabilidad.
- El modo de impresión por defecto continúa siendo `DIALOGO`; `SILENCIOSA` es opcional y se
  configura por documento o estación.
