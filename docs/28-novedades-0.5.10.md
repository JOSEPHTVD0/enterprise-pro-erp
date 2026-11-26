# Novedades de la versión 0.5.10

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.10

Incluye todo lo publicado en `0.5.9` y añade el **Ingreso de Mercancía** sobre el módulo
real `compras`. Detalle funcional: [docs/27](27-ingreso-mercancia.md).

## Cambios

- **Ingreso de mercancía real**: vista única con proveedor a la izquierda, documentos al
  centro, totalización a la derecha, buscador debajo y tabla de productos al final. Las
  columnas son exactamente `Orden #`, `Código`, `Descripción`, `Referencia`, `Cant`,
  `PVS`, `Costo`, `Desc1`, `Desc2`, `Desc3`, `Sub-total` e `I.V.A.`.
- **Proveedor**: búsqueda por nombre/RNC/código, autocompletado, referencia crediticia
  real y alta sin salir mediante `maestros.save` (requiere `proveedores.crear`).
- **Documentos**: consecutivo seguro, fechas, factura/NCF del proveedor sin generación
  automática y con validación de duplicado, orden de compra, moneda/tasa real de
  `tasas_cambio`, clasificación contable, depósito, nota y captura del monto factura para
  calcular la diferencia.
- **Totalización automática**: bruto, descuentos 1/2/3 secuenciales, flete prorrateado,
  exento, base imponible, ITBIS desglosado por tasa, ajuste, total neto y diferencia
  contra factura. Todo sale de `@shared/dinero`, `@shared/impuestos` y
  `src/main/core/costos.ts`; no hay cálculos simulados.
- **Guardar transaccional**: cabecera, líneas, impuestos por tasa, stock, costo promedio,
  movimiento de inventario, CxP a crédito o pagos al contado, asiento real `COMPRA` en
  `BORRADOR`, auditoría y versión `CREAR`. La anulación revierte todo y la edición
  reaplica la factura corregida en una sola transacción.
- **Permisos individuales** verificados en backend: ver, crear, editar, anular,
  `compras.costo`, `compras.descuento`, `compras.tasa`, `compras.almacen`,
  `compras.historial` e imprimir.
- **Historial e impresión**: versiones, reimpresiones, auditoría y asientos consultables;
  el PDF registra reimpresión y versión `IMPRIMIR`.
- **Migración `013_ingreso_mercancia`**: columnas compatibles con backfill, tablas de
  impuestos por tasa, versiones y reimpresiones, índices, cuenta `4120` y permisos nuevos.
  No se editaron migraciones `001`–`012`.
- **Catálogo corregido**: `compras.catalogos` devuelve `referencia` y `precio1Cent`, para
  que Referencia y PVS de la tabla muestren datos reales; `tasaVigente` dejó de exponerse
  por IPC por no ser serializable.

## Seguridad

No cambian `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, el
`isTrusted` de los canales IPC, las políticas de sesión (30 min / 12 h), la verificación
de permisos en servicio, las transacciones ni la auditoría. No hay emisión ni
certificación DGII: el NCF sigue siendo una referencia del proveedor.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.10.exe` — 145.527.128 bytes.
- SHA-256: `D16E382BFE03649EDC9F8750456D9CBE7BC8927EB71D3002BF76C0E0648B738E`.
- SHA-512: `IM15UeO3B3i0rjqD5OXy7J+WbGyGxHF/d6mv80pZgy68VPKh+zl7BszfB+gaTNAN46PBAt+r14bwFmkMSTJ0gA==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.10/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.10/EnterpriseProERP-Setup-0.5.10.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo. `Get-AuthenticodeSignature`
informa `Status: 1` por la raíz no confiable; es el caso esperado y reconocido por el
verificador propio del actualizador. SmartScreen no desaparece sin una CA pública.

A diferencia de las release anteriores, el árbol de trabajo completo se confirmó y envió
a `main` antes de crear el tag, para que el código fuente de esta versión quede
versionado junto con los artefactos.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 46 archivos, 331 pruebas.
- `npm.cmd run test:e2e`: 25/25.
- `npm.cmd run test:updater`: detectó `0.5.11` en un feed efímero desde la `0.5.10`
  instalada y guardó el instalador sin ejecutarlo.
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder y dos sesiones
  simultáneas.
- Los 14 casos del ingreso están en `tests/integration/ingreso-mercancia.test.ts`.
