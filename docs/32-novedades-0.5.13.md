# Novedades de la versión 0.5.13

> **Nota histórica:** este documento describe solo su release. La release publicada actual es
> **`v0.5.16`** (tag `v0.5.16`), verificada con **56 archivos / 386 pruebas** y **31/31
> E2E**; consulte [37-novedades-0.5.16.md](37-novedades-0.5.16.md). Los cambios descritos en
> [35-consistencia-ui-ajustes.md](35-consistencia-ui-ajustes.md) y
> [36-panel-horizontal-avanzado.md](36-panel-horizontal-avanzado.md) ya están publicados en
> `v0.5.16`.

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.13

Incluye todo lo publicado en `0.5.12` y añade una reorganización visual del panel
**Facturación ECF** para hacerlo más limpio, más legible y más atractivo. El cambio es
exclusivamente de presentación: no se modificaron validaciones, permisos, canales IPC ni
esquemas de datos.

## Cambios

- **Estructura más clara**: el área superior quedó dividida en dos bloques —`Cliente` y
  `Nota` a la izquierda, `Resumen` y `Acciones` a la derecha— y el detalle ocupa la fila
  inferior completa. Desapareció la columna central estrecha que comprimía los campos.
- **Tarjetas con jerarquía**: cada sección tiene encabezado, icono y separador propio. Los
  rótulos son más pequeños y uniformes, con mejor contraste y alineación.
- **Cabecera operativa renovada**: badge de condición `1 - CONTADO` / `2 - CRÉDITO`, icono
  de documento, título `Facturación ECF`, subetiqueta `Módulo de ventas` y la ayuda `F7
  guardar` en la misma barra. Moneda, Tasa, Depósitos y Fecha siguen en su lugar.
- **Resumen financiero destacado**: las siete líneas conservan sus mismos cálculos, pero el
  `Total Neto` ahora se muestra en un bloque con degradado y tipografía más grande.
- **Detalle más legible**: la tabla mantiene `# / Código / Descripción / QTY / Precio /
  Total`, con cabecera fija, fila activa marcada con acento lateral, alternancia suave y un
  estado vacío con icono.
- **Botonera compacta**: `Salvar F7` conserva su handler principal; las seis operaciones
  (`Precio`, `Descuento`, `Cantidad`, `Cancelar`, `Borrar`, `Salir`) quedan en una cuadrícula
  2x3 con iconos, hover y foco más visibles.
- **Componentes internos reutilizables**: se extrajeron `Entrada`, `Campo`, `Tarjeta` y
  `FilaResumen` dentro del propio panel, reduciendo repetición y facilitando mantenimiento.
- **Tema**: fondos con degradado suave, radios más grandes, sombras sutiles y acentos
  índigo/violeta, sin cortes ni superposiciones en resoluciones de escritorio.

## Sin cambios funcionales

- `F7` sigue llamando al mismo `guardar()` y se sigue ignorando mientras el modal de pedidos
  está abierto.
- `Ver Pedido` continúa consultando `cotizaciones.documentos` con `{ tipo: 'PEDIDO' }` y
  `ventas.detalle`, cargando cliente, vendedor, nota y líneas al carrito real.
- Los importes salen de `totalesCarrito` y `@shared/impuestos`, el mismo motor del servidor.
- `Tipo NCF` se mapea a `FACTURA_CONTADO` / `FACTURA_CREDITO`; serie y NCF los asigna el
  backend con `ventas.factura.crear`.
- Los permisos `ventas.precio` y `ventas.descuento` siguen aplicando sobre la edición.
- El panel sigue usando el mismo `FormularioVenta` que el modal de facturas, el POS y las
  cotizaciones.

## Límites honestos

Moneda, Tasa, Dirección, Teléfono/Célular y Forma Pago continúan siendo valores de pantalla:
el backend actual no expone esos campos en `FormularioVenta` ni en el payload de factura.
No se agregó ninguna llamada IPC ni cálculo nuevo. No hay emisión ni certificación
DGII/e-CF.

## Seguridad

No cambian `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, el
`isTrusted` de los canales IPC, las políticas de sesión, la verificación de permisos en
servicio, los esquemas Zod, las transacciones ni la auditoría. El rediseño solo modifica
presentación y estado local del formulario.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.13.exe` — 145.543.208 bytes.
- SHA-256: `30E25B263B63A89A6B61B2079809A51C26824B494958C1BFD51534A4DA586CE2`.
- SHA-512: `usyzuG8WIrXsgW5mMNqIuI1aGRRiKGONnuZ9+1VSS7HmyddiQI/0MoAuibGsOumGAFAEQK7xJKcjy7583HM9zg==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.13/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.13/EnterpriseProERP-Setup-0.5.13.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo.
`Get-AuthenticodeSignature` informa `Status: 1` por la raíz no confiable; es el caso esperado
y reconocido por el verificador propio del actualizador. SmartScreen no desaparece sin una
CA pública.

El árbol de trabajo completo se confirmó y envió a `main` antes de crear el tag, para que
el código fuente de esta versión quede versionado junto con los artefactos.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 47 archivos, 337 pruebas.
- `npm.cmd run test:e2e`: 26/26, sin errores de consola inesperados.
- `npm.cmd run test:updater`: detectó `0.5.14` en un feed efímero desde la `0.5.13`
  instalada y guardó el instalador sin ejecutarlo.
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder y dos sesiones
  simultáneas.
- `npm.cmd run dist:win`: instalador NSIS firmado y blockmap generados.
- `npm.cmd run release:feed`: `release/latest.yml` generado después de firmar; su SHA-512
  coincide con el instalador publicado.
