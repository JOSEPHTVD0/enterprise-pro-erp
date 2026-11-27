# Novedades de la versión 0.5.15

Publicada el 27 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.15

Incluye todo lo publicado en `0.5.14` y añade **impresión nativa real**,
**configuración por documento**, **centro de impresión** e **impresión por
lotes**. No se modificó el rediseño de `FacturacionEcfPanel` publicado en
`0.5.13` ni se agregó integración real con DGII: DGI sigue siendo solo
configuración visual, sin envío, exportación ni simulación de e-CF.

## Cambios

### Impresión nativa del sistema

- Nuevo servicio `src/main/services/impresion.service.ts` basado en
  `webContents.getPrintersAsync()` y `webContents.print()` de Electron.
- Canales IPC seguros `impresoras.listar` e `impresion.ejecutar`, registrados
  detrás de sesión, puerta de cambio de contraseña, permiso, validación Zod y
  servicio. El renderer no envía SQL, rutas ni lógica de negocio.
- Esquemas compartidos en `src/shared/schemas/impresion.ts` para impresoras,
  opciones, ejecución y prueba; copias, modo, color, fondo y orientación se
  validan antes de llegar al proceso principal.
- Precedencia real: impresora/configuración del documento → impresora general
  de la estación → predeterminada del sistema. La impresora se envía como
  `deviceName`; no se inventan nombres cuando el sistema no devuelve ninguna.

### Configuración por documento

- `settings.impresion` incorpora `modo`, `impresorasPorDocumento`,
  `modosPorDocumento`, `color`, `fondo` y `orientacion`, con migración Zod de
  ajustes existentes.
- Modo `DIALOGO` abre el diálogo nativo con la impresora elegida; modo
  `SILENCIOSA` envía directamente a esa impresora.
- Configuración avanzada muestra impresoras detectadas y tabla de impresora y
  modo por tipo de documento. `tiposDocumentoImpresion` cubre ventas, POS,
  cotizaciones, compras y financiero.
- Corregida la prueba de impresión: al imprimir la prueba se ocultan las áreas
  reales mediante un atributo con `!important`, evitando que aparezcan junto al
  comprobante de prueba.

### Centro de impresión

- Nuevo módulo `centro-impresion` con permiso `configuracion.consultar`,
  iconografía, personalización de vistas y registro en el menú/paleta.
- Lista impresoras reales del equipo con nombre, alias y badge de
  predeterminada; botón de redetección y selector reutilizable.
- Consulta documentos solo a través de canales ya existentes y protegidos:
  ventas, compras, cobros/recibos, CxC, CxP, bancos y cajas. Cada fila mantiene
  sus permisos de consulta e impresión.
- Impresión individual y por lotes con selección múltiple, progreso y
  confirmaciones; el origen de datos sigue siendo la base de datos real.
- El catálogo SQLite `impresoras` continúa siendo metadato de empresa/caja; no
  se confunde con la lista del sistema operativo.

### Botones de impresión conectados

- Los diez flujos que usaban `window.setTimeout(() => window.print(), 80)`
  ahora llaman a `imprimirDocumento(...)` con el tipo y formato correctos:
  Facturación, POS, Cotizaciones, Compras, Cobros, CxC, CxP, Bancos, Cajas y
  Reportes.
- Se conservan las áreas de impresión, el CSS `@media print`, el
  mascaramiento de RNC, los formatos carta/media/ticket 80 mm/ticket 58 mm y
  la confirmación de `impresionAutomatica` en Cajas.
- No quedaron botones muertos en `features/**/*.tsx`; los `NOOP` detectados
  son cierres forzados de modal deliberados.

### Seguridad e integridad

- `contextIsolation: true`, `nodeIntegration: false`, token en memoria del
  preload, permisos verificados en el servicio, esquemas Zod, transacciones y
  auditoría sin cambios.
- Borradores de facturación siguen en `localStorage`; los comprobantes emitidos
  son inmutables.
- Los importes continúan en centavos y `cxc_documentos.saldo_cent` sigue siendo
  la fuente autoritativa de saldo.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 51 archivos, 353 pruebas.
- `npm.cmd run test:e2e`: 31/31, sin errores de consola inesperados.
- `npm.cmd run test:updater`: detectó y descargó la versión del feed sin
  ejecutar el instalador.
- `npm.cmd run test:instancias`: instancias concurrentes con un solo líder y
  sesiones simultáneas.
- `npm.cmd run dist:win`: instalador NSIS firmado y blockmap generados.
- `npm.cmd run release:feed`: `release/latest.yml` regenerado tras la firma;
  su SHA-512 coincide byte a byte con el instalador.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.15.exe` — 145.554.112 bytes.
- SHA-256: `F1A548C44B4FB73C2845C170C42134E41959C2625B08B6A1DEF290EE2572FCC3`.
- SHA-512: `FC30F908E07F7C5080218A5E4779A8AC289CD1599F1FAE0A09D973E24A4E167731D2797D1D0DD563E93618983D5413990271E9FE2E656C6FB6AA692C5666AA23`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.15/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.15/EnterpriseProERP-Setup-0.5.15.exe.blockmap

El instalador se firma con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo.
`Get-AuthenticodeSignature` informa `UnknownError` («termina en un certificado
de raíz no compatible con el proveedor de confianza»), el caso esperado con un
certificado autofirmado. SmartScreen no desaparece sin una CA pública.
