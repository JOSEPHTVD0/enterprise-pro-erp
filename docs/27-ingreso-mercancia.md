# Ingreso de mercancía

Este documento describe el **Ingreso de Mercancía** implementado sobre el módulo real
`compras`. Se publicó en la versión `0.5.10`
([novedades](28-novedades-0.5.10.md)); la versión anterior fue `v0.5.9`
([docs/26](26-novedades-0.5.9.md)).

## Principio de una sola fuente de verdad

No se creó un módulo paralelo `ingresos`. El ingreso directo apoya el documento
`FACTURA_COMPRA`, que es el único documento existente que mueve stock, genera CxP y
admite pagos. Se reutilizan sus catálogos, numeración y cálculos:

- `@shared/dinero`: conversión decimal ↔ centavos y redondeo.
- `@shared/impuestos`: descuentos secuenciales e ITBIS por tasa.
- `src/main/core/costos.ts`: costo promedio y movimientos de inventario.
- `src/shared/contabilidad.ts`: plan de cuentas y asiento `COMPRA`.

Toda ampliación de base de datos está en la migración nueva
`src/main/db/migrations/013_ingreso_mercancia.ts`. No se editaron las migraciones
`001`–`012`; la `013` añade columnas con valores por defecto, hace backfill de filas
históricas, crea `documento_compra_impuestos`, `compra_versiones`,
`compra_reimpresiones`, índices, la cuenta `4120` (ITBIS pagado en compras) y los
permisos finos nuevos para Administrador y Gerente.

## Pantalla

`ComprasPage` tiene tres pestañas: **Ingreso de mercancía**, **Documentos** e
**Historial**. La vista principal es `IngresoMercancia.tsx`, con la distribución:

1. **Izquierda — Proveedor**: búsqueda por nombre, RNC o código, autocompletado,
   referencia crediticia (balance real), condición de pago y alta sin salir mediante
   `maestros.save` con entidad `proveedores` (requiere `proveedores.crear`).
2. **Centro — Documentos**: fecha contable, fecha de llegada, factura/NCF del proveedor,
   orden de compra, moneda y tasa, monto en moneda del proveedor, clasificación
   contable, almacén, vencimiento, nota, condición contado/crédito, motivo de corrección
   y editor de pagos. El número de factura **nunca se genera automáticamente** y se
   valida duplicado por empresa/tipo/proveedor.
3. **Derecha — Totalización**: bruto, descuento 1, descuento 2, desc. ítems, flete,
   exento, base imponible, ITBIS por tasa, total neto, monto factura y diferencia.
   Los importes son de solo cálculo; no se escriben a mano salvo flete y ajuste.
4. **Abajo — Buscador**: `Enter` agrega, `↑`/`↓` recorren coincidencias, `Esc` limpia.
   Navegación encadenada: `Cantidad → Costo → Agregar → Buscador`.
5. **Tabla de productos**: columnas exactas `Orden #`, `Código`, `Descripción`,
   `Referencia`, `Cant`, `PVS`, `Costo`, `Desc1`, `Desc2`, `Desc3`, `Sub-total`,
   `I.V.A.`. Cada fila usa `calcularFila` del motor compartido.

El encabezado muestra título, estado y **Cancelar** (pide confirmación si hay cambios)
y **Guardar** (procesa la compra). Guardar crea o corrige el documento; en edición
exige un motivo de al menos 3 caracteres.

## Cálculo

- Descuentos 1, 2 y 3 se aplican **secuencialmente** en `src/shared/impuestos.ts`.
- El flete de cabecera se prorratea entre las líneas y se incorpora al costo, sin
  gravarse dos veces.
- La base gravada y la exenta se separan; el ITBIS se desglosa por tasa real en
  `documento_compra_impuestos`.
- `tasaAplicada` sale de `tasas_cambio` cuando no se fija a mano. Una tasa manual
  distinta de `1` requiere `compras.tasa`.
- `montoFacturaCent`, `montoFacturaMonedaCent`, `ajusteCent` y `diferenciaCent` se
  persisten para conciliar contra la factura recibida.
- La numeración es atómica (`UPDATE series_documento … RETURNING`); si la transacción
  revierte, el correlativo no se consume.

## Guardar transaccional

`crearDocumento()` inserta cabecera, líneas e impuestos por tasa; actualiza stock y
costo promedio; escribe el movimiento de inventario; genera CxP a crédito o pagos al
contado; contabiliza un asiento real `COMPRA` en `BORRADOR`; registra auditoría y la
versión `CREAR`. `anular()` revierte kardex, CxP, pagos y asiento (lo marca `ANULADO`)
y deja la versión `ANULAR`. `editarIngreso()` revierte todo lo anterior y reaplica la
factura corregida dentro de una sola transacción, con versión `MODIFICAR`.

La contabilidad del ingreso es igual a la integración de ventas: el asiento nace en
`BORRADOR`. La auditoría del asiento **no** cuenta como auditoría del documento.

## Permisos individuales

Ver, crear, editar, anular, modificar costos, aplicar descuentos, cambiar tasa, cambiar
almacén, historial e imprimir se verifican en el **servicio**, no solo en la interfaz.
Los nuevos son `compras.descuento`, `compras.tasa`, `compras.almacen` y
`compras.historial`. `compras.detalle` oculta costos sin `compras.costo`;
`datosImpresion` exige `compras.imprimir` y registra la reimpresión.

## Historial e impresión

La pestaña **Historial** consulta `compras.ingreso.historial` y muestra documentos,
versiones, reimpresiones, auditoría y asientos. `pdf.generar` reutiliza
`compras.datosImpresion`, que registra reimpresión y versión `IMPRIMIR`.

## Verificación

Los 14 casos reales están en `tests/integration/ingreso-mercancia.test.ts` (contado,
crédito, ITBIS mixto, exentos, descuentos, flete, moneda extranjera, multiartículo,
stock, CxP, anulación/reversión, edición, historial/impresión y permisos). Los contratos
Zod se cubren en `tests/unit/compras-esquemas.test.ts`. Se ejecutó:

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 46 archivos, 331 pruebas.
- `npm.cmd run test:e2e`: 25/25.
- `npm.cmd run test:updater`: correcto (feed efímero, sin instalación automática).
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder.

## Limitaciones

- No hay emisión ni certificación DGII; el NCF es una referencia del proveedor.
- No existe `SELECT … FOR UPDATE`, columna `version` ni optimistic lock; WAL y
  `busy_timeout` serializan escrituras.
- `crearDocumento()` sigue rechazando `RECEPCION`; `registrarRecepcion()` exige orden
  de compra y número `REC-`.
- El código fuente se versiona junto con esta release; los binarios no se versionan en Git.
