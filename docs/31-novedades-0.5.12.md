# Novedades de la versión 0.5.12

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.12

Incluye todo lo publicado en `0.5.11` y añade el panel **Facturación ECF** sobre el
módulo de Ventas existente. El objetivo fue igualar la distribución, densidad y jerarquía
visual de la pantalla de referencia sin sustituir la lógica real ni inventar operaciones.

## Cambios

- **Pestaña nueva**: `Facturación ECF` es la vista inicial de Ventas; `Documentos`,
  `Conduces y entregas` y el modal «Nueva factura» siguen disponibles y con sus handlers
  originales.
- **Cabecera operativa**: barra `1 - CONTADO` / `2 - CRÉDITO`, título `Facturación ECF`,
  Moneda, Tasa, Depósitos y Fecha en formato `dd/mm/aaaa`. Depósitos y Fecha escriben en
  `form.almacenId` y `form.fecha`; el botón de enlace abre los pedidos reales.
- **Cliente y documento**: búsqueda por código/nombre con RNC y límite de crédito reales
  desde `ventas.catalogos`, además de Nombre, Dirección, Teléfono/Célular, Vendedor y
  `Tipo NCF`. El tipo se mapea a `FACTURA_CONTADO` / `FACTURA_CREDITO`; la serie y el NCF
  los asigna el backend.
- **Nota y pedidos**: el área `Nota` edita `comentarios`; `Ver Pedido` consulta
  `cotizaciones.documentos` con `tipo: 'PEDIDO'` y `ventas.detalle`, cargando cliente,
  vendedor, nota y líneas al carrito real.
- **Resumen financiero**: Total Bruto, Descuento 1/2, Desc. Items, Monto Exento, Base
  Imponible, ITBIS y Total Neto calculados con `totalesCarrito` y `@shared/impuestos`, el
  mismo motor que usa el servidor.
- **Detalle**: tabla densa `# / Código / Descripción / QTY / Precio / Total` con búsqueda,
  alta de productos reales del catálogo y edición de línea por botón o directamente en la
  celda.
- **Botonera**: `Salvar F7` plus cuadrícula `Precio`, `Descuento`, `Cantidad`, `Cancelar`,
  `Borrar` y `Salir`. `F7` llama al mismo `guardar()` que valida cliente, líneas, total y
  persiste con `ventas.factura.crear`. Los permisos `ventas.precio` y `ventas.descuento`
  siguen aplicando.
- **Tema**: estilo oscuro de alta densidad tipo POS/ERP con `color-scheme: dark` propio del
  panel, sin cortes en resoluciones de escritorio.

## Límites honestos

Moneda, Tasa, Dirección, Teléfono/Célular y Forma Pago son valores de pantalla: el backend
actual no expone esos campos en `FormularioVenta` ni en el payload de factura. No se agregó
ninguna llamada IPC ni cálculo nuevo. No hay emisión ni certificación DGII/e-CF.

## Seguridad

No cambian `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, el
`isTrusted` de los canales IPC, las políticas de sesión, la verificación de permisos en
servicio, los esquemas Zod, las transacciones ni la auditoría. El panel reutiliza los mismos
canales y validaciones que ya tenía Facturación; solo modifica la presentación y el estado
local del formulario.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.12.exe` — 145.541.368 bytes.
- SHA-256: `D6379C79A33DAFE97D52BA6FCB25DF59BF4E0406219B801EAB34BE69E03101D3`.
- SHA-512: `1oxORKzA+/4/+VwNmkfKnLLrOKrwQH/pGyHrgNAizCDBWkW+5orRBseMwR58isQGihHBJ7PGVdW+PjbY4RfpFA==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.12/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.12/EnterpriseProERP-Setup-0.5.12.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo.
`Get-AuthenticodeSignature` informa `Status: 1` por la raíz no confiable; es el caso
esperado y reconocido por el verificador propio del actualizador. SmartScreen no
desaparece sin una CA pública.

El árbol de trabajo completo se confirmó y envió a `main` antes de crear el tag, para que
el código fuente de esta versión quede versionado junto con los artefactos.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 47 archivos, 337 pruebas.
- `npm.cmd run test:e2e`: 26/26, sin errores de consola inesperados.
- `npm.cmd run test:updater`: detectó `0.5.13` en un feed efímero desde la `0.5.12`
  instalada y guardó el instalador sin ejecutarlo.
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder y dos sesiones
  simultáneas.
- `npm.cmd run dist:win`: instalador NSIS firmado y blockmap generados.
- `npm.cmd run release:feed`: `release/latest.yml` generado después de firmar; su SHA-512
  coincide con el instalador publicado.
