# 02 — Modelo de Datos · ENTERPRISE PRO ERP

> Fase 1 · Diseño inicial SQLite. Todas las tablas operativas incluyen `empresa_id`.
> Dinero en **centavos enteros**; cantidades REAL(4 dec). PK `INTEGER` autoincremental;
> códigos visibles únicos por empresa. FKs activas (`PRAGMA foreign_keys=ON`), modo WAL.
> Borrado: maestros usan `activo` (soft-delete); documentos contabilizados son inmutables.

> **Estado del modelo:** la release publicada es `v0.5.16` (tag `v0.5.16`), verificada
> con **56 archivos / 386 pruebas** y **31/31 E2E**. La release conecta las preferencias
> fiscales (moneda/decimales/fecha) al formato de la interfaz, refleja los flags vigentes
> en capacidades, completa `vistasPersonalizables` y añade el tablero horizontal sobre
> tablas existentes; no añade tablas ni columnas nuevas a este modelo. Los borradores de
> facturación viven en `localStorage` y los comprobantes emitidos siguen siendo
> inmutables. DGI es solo rotulado visual: no emite, exporta ni simula e-CF.

## Convenciones

- `*_centavos` → INTEGER (dinero). `cantidad` → REAL. Timestamps ISO-8601 UTC TEXT.
- Índices en toda FK, en campos de búsqueda (código, nombre, barcode, fecha, estado).
- Migraciones numeradas `001_init.sql …`, aplicadas por un runner con tabla `_migraciones`.
- Cada documento guarda una copia (snapshot) de nombres/precios del momento (cliente, producto) para
  reprint histórico fiel aunque el maestro cambie después.

## Módulo Configuración

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `empresas` | id, nombre_comercial, razon_social, rnc, cedula, direccion, telefonos, email, logo_path, moneda_base, activa | raíz de aislamiento |
| `parametros` | empresa_id, clave, valor (JSON) | ITBIS %, permitir stock negativo, decimales, formato fecha, etc. |
| `monedas` / `tasas_cambio` | codigo, simbolo; moneda_id, tasa, fecha | empresa_id |
| `impuestos` | codigo (ITBIS18, EXENTO…), tasa_bp (puntos base), tipo | empresa_id |
| `series_documento` | tipo_doc, serie, prefijo, siguiente, longitud, es_ncf, rango_desde/hasta, vence_en, alerta_min | numeración atómica por empresa+tipo |
| `formatos_impresion` | tipo_doc, formato (carta/media/80mm/58mm), predeterminado | empresa_id |

## Módulo Seguridad

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `usuarios` | id, username (único global), nombre, hash_scrypt, salt, activo, bloqueado, departamento_id, intentos_fallidos | — |
| `roles` | id, nombre, descripcion, empresa_id | — |
| `permisos` | id, clave (`ventas.factura.anular`) | catálogo seed |
| `rol_permisos` | rol_id, permiso_id | N:M |
| `usuario_roles` | usuario_id, rol_id, empresa_id | acceso por empresa |
| `usuario_permisos_override` | usuario_id, permiso_id, concedido | excepciones |
| `departamentos` | id, nombre, empresa_id | — |
| `sesiones` | id, usuario_id, empresa_id, inicio, fin, ultima_actividad, token_hash | auditoría de acceso |

## Maestros

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `clientes` | codigo, nombre, tipo, rnc_cedula, telefono, whatsapp, email, direccion, provincia, municipio, limite_credito_cent, balance_cent (derivado/cache), condicion_pago_dias, lista_precio_id, vendedor_id, observaciones, activo | vendedor_id→vendedores |
| `proveedores` | codigo, nombre_comercial, razon_social, rnc, telefono, email, direccion, contacto, condicion_pago_dias, balance_cent, cuenta_bancaria, observaciones, activo | — |
| `categorias` / `marcas` | nombre, padre_id (categorías jerárquicas) | empresa_id |
| `unidades_medida` | codigo, nombre, decimales | empresa_id |
| `productos` | codigo, barcode, referencia, descripcion, descripcion_extra, categoria_id, marca_id, modelo, unidad_id, tipo (fisico/servicio/compuesto/serializado/lote), costo_promedio_cent, costo_ultima_compra_cent, precio1..3_cent, precio_mayorista_cent, precio_minimo_cent, impuesto_id, existencia_min/max, ubicacion, imagen_path, maneja_serie, maneja_lote, activo | empresa_id |
| `producto_componentes` | producto_padre_id, componente_id, cantidad | productos compuestos (kits) |
| `listas_precio` / `lista_precio_items` | nombre; lista_id, producto_id, precio_cent | precios por lista |
| `historial_precios` | producto_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha | auditoría de precios |
| `vendedores` | codigo, nombre, usuario_id?, comision_pct_bp, regla (venta/cobro/producto), activo | usuarios opcional |
| `almacenes` | codigo, nombre, direccion, principal, activo | empresa_id |
| `clientes_direcciones` (futuro) | — | reservado para entregas |

Las tablas de maestros de esta sección quedaron materializadas en la migración `002_maestros`
(Fase 4), con `empresa_id`, índices por empresa/búsqueda, `activo` para borrado lógico y
campos de auditoría de fecha donde aplica. `producto_componentes` y `lista_precio_items`
se crearon desde esta fase para conservar la integridad referencial prevista.

## Inventario

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `existencias` | producto_id, almacen_id, cantidad, valor_cent, UNIQUE(producto, almacen) | saldo físico y valorado; se actualiza solo desde el kardex |
| `movimientos_inventario` (Kardex) | id, fecha, tipo (compra, venta, dev_venta, dev_compra, transferencia_entrada/salida, ajuste_entrada/salida, perdida, danio, conteo, produccion), producto_id, almacen_id, cantidad (+/-), costo_unit_cent, costo_total_cent, saldo_cantidad, saldo_costo_cent, doc_tipo, doc_id, doc_linea_id, motivo, referencia, usuario_id | **inmutable**: triggers `BEFORE UPDATE/DELETE` rechazan cambios; fuente del kardex valorado |
| `transferencias` / `transferencia_lineas` | numero, almacen_origen, almacen_destino, estado (activo/anulado), fecha; líneas con costo y movimientos vinculados | generan 2 movimientos por línea: salida al costo vigente y entrada al **mismo costo** (sin recálculo) |
| `ajustes_inventario` / `ajuste_lineas` | numero, tipo (ajuste/conteo/perdida/daño), motivo, estado, almacén; líneas con delta, cantidad contada y movimiento | en conteos el delta se calcula restando el saldo actual de la cantidad física |
| `series_producto` | producto_id, serie, estado (disponible/vendido/devuelto), almacen_id, doc_tipo, doc_id | serializados; alta solo si el producto `maneja_serie` |
| `lotes_producto` | producto_id, lote, vencimiento, cantidad, almacen_id | lotes; alta solo si el producto `maneja_lote` |
| `costos_historial` | producto_id, costo_anterior_cent, costo_nuevo_cent, origen_doc, origen_id, fecha | solo registra cambios reales del promedio |

**Costo promedio ponderado (centralizado en `core/costos` y `shared/dinero`):**
`nuevo_costo = (existencia_valorada + entrada_valorada) / (existencia_qty + entrada_qty)`
Redondeo y conversión decimal↔centavos viven en un único módulo compartido por main y renderer.
Solo las entradas que incrementan valor recalculan; las transferencias conservan el valor y las
salidas descuentan `costo_vigente × cantidad` sin modificar el promedio. El valor total se guarda
en centavos y es la fuente de verdad; el costo unitario es una proyección informativa.

**Reglas operativas de la Fase 5:**
- Numeración interna atómica: series `AJUSTE_INVENTARIO` (`AJU-`) y `TRANSFERENCIA_INVENTARIO` (`TRF-`) por empresa, reutilizando `nextSerieNumber`. No son NCF ni documentos fiscales.
- Stock negativo: bloqueado por defecto; el parámetro `permitir_stock_negativo` lo habilita. El valor valorado nunca es negativo.
- Anulaciones: se hacen con movimientos inversos (`REVERSA_TRANSFERENCIA`, `REVERSA_AJUSTE`), nunca borrando ni editando el kardex.
- Costos y valores se ocultan en consultas/exportaciones si falta el permiso `inventario.costo`.

## Ventas

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `documentos_venta` | id, tipo (FACTURA_CONTADO, FACTURA_CREDITO, POS, COTIZACION, PEDIDO, NOTA_CREDITO, NOTA_DEBITO, DEVOLUCION, RECIBO_INGRESO, CONDUCE), numero_interno, ncf?, serie, cliente_id (+nombre/rnc snapshot), fecha, vencimiento, vendedor_id, almacen_id, condicion (contado/credito), estado (borrador/pendiente/aprobada/contabilizada/anulada/convertida/vencida/rechazada), subtotal_cent, descuento_cent, impuesto_cent, total_cent, costo_total_cent, doc_origen_id, motivo, comentarios, usuario_id | doc_origen_id → trazabilidad de conversiones |
| `documento_venta_lineas` | doc_id, producto_id (+descripcion snapshot), cantidad, cantidad_entregada, cantidad_pendiente, precio_cent, descuento_pct_bp, descuento_cent, impuesto_id, impuesto_cent, costo_cent, subtotal_cent | cantidad_entregada habilita conduce |
| `conduces` | doc_venta_id (factura), numero, estado (parcial/completo), fecha | + `conduce_lineas` (entregadas/pendientes) |
| `entregas_conduce` | conduce_id, fecha, usuario_id, lineas entregadas | completa pendientes |
| `pagos_venta` (recibos) | doc_id?, cliente_id, fecha, total_cent, metodo, caja_sesion_id?, banco_cuenta_id?, usuario_id | + `pagos_venta_aplicaciones` (recibo→factura, monto) |
| `ventas_suspendidas` (POS) | id, usuario_id, caja_id, payload JSON, fecha | suspender/recuperar |
| `documento_pagos` | doc_venta_id, metodo (efectivo/tarjeta/transferencia/credito), monto_cent, referencia | pago combinado |

Conversiones: cotización→pedido→factura copian líneas, enlazan `doc_origen_id` y marcan
el origen `convertida` (no duplicable). Anulación de factura: documento contrario +
reversa de inventario, CxC y caja en una transacción.

## Compras (Fase 7, migración `005_compras`)

| Tabla | Campos clave | Relaciones |
|---|---|---|
| `documentos_compra` | tipo (`SOLICITUD_COMPRA`, `ORDEN_COMPRA`, `RECEPCION`, `FACTURA_COMPRA`, `DEVOLUCION_COMPRA`), numero, numero_proveedor, proveedor_id (+nombre/rnc snapshot), fecha, vencimiento, almacen_id, condicion (`CONTADO`/`CREDITO`), estado, subtotal/descuento/impuesto/gasto/total/costo_total_cent, doc_origen_id, motivo, comentarios, usuario_id | flujo solicitud→orden→recepción→factura; `UNIQUE (empresa_id, tipo, numero)` |
| `documento_compra_lineas` | doc_id, producto_id (+descripcion snapshot), cantidad, cantidad_recibida, cantidad_devuelta, precio_cent, descuento_pct_bp, descuento_cent, gasto_cent, impuesto_id (+codigo/tasa/exento/impuesto_cent), subtotal/total/costo_unit_cent, numero_serie, lote | recepción parcial y reversas por línea |
| `pagos_compra` | doc_id, metodo, monto_cent, referencia, caja_sesion_id, caja_movimiento_id, usuario_id | pagos de documentos ligados a caja |
| `cxp_documentos` | proveedor_id, doc_compra_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado (`PENDIENTE`/`PAGADO`/`ANULADO`) | `UNIQUE (empresa_id, doc_compra_id)` |
| `cxp_movimientos` | cxp_documento_id, doc_compra_id, proveedor_id, tipo (`CARGO`/`ABONO`/`ANULACION`), monto_cent, fecha, referencia, usuario_id | historial de CxP; ajusta `proveedores.balance_cent` |

La recepción mueve stock y recalcula el costo promedio; la factura contra recepción no genera
kardex propio, pero la factura directa o contra orden sí. Los gastos por línea se capitalizan al
costo y se adeudan al proveedor sin recalcular ITBIS. Anulaciones y devoluciones insertan
movimientos inversos (`DEV_COMPRA`, `recalcular: false`) sin borrar el kardex. La CxP se abre al
facturar a crédito, se abona con devoluciones y se cancela con `ANULACION`. Las series
`SOL-`/`OC-`/`REC-`/`FCO-`/`DCO-` son internas; `numero_proveedor` guarda el NCF o factura
recibida del proveedor y el ERP nunca lo genera.

## Finanzas (Fase 8, migración `006_finanzas`)

| Tabla | Campos clave | Relaciones / reglas |
|---|---|---|
| `cxc_documentos` / `cxp_documentos` | cliente_id/proveedor_id, doc_venta_id/doc_compra_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado | creados por Ventas/Compras; Fase 8 consume el saldo, calcula antigüedad y aplica abonos multi-factura |
| `cxc_movimientos` / `cxp_movimientos` | documento_id, tipo (`CARGO`/`ABONO`/`ANULACION`/…), monto_cent, pago_id, referencia, fecha, usuario_id | historial inmutable; nunca se edita ni se borra |
| `cxc_recibos` | numero, cliente_id, cliente_nombre, monto_cent, metodo, referencia, anticipo_id?, caja_sesion_id?/banco_cuenta_id?, estado (`CONTABILIZADO`/`ANULADO`) | `UNIQUE (empresa_id, numero)`; contrapartida ligada al recibo |
| `cxc_recibo_aplicaciones` | recibo_id, cxc_documento_id, monto_cent | una fila por factura cobrada; la suma debe igualar `cxc_recibos.monto_cent` |
| `cxp_pagos` | numero, proveedor_id, proveedor_nombre, monto_cent, metodo, referencia, anticipo_id?, caja_sesion_id?/banco_cuenta_id?, estado | `UNIQUE (empresa_id, numero)`; contrapartida ligada al pago |
| `cxp_pago_aplicaciones` | pago_id, cxp_documento_id, monto_cent | una fila por factura pagada; la suma debe igualar `cxp_pagos.monto_cent` |
| `anticipos` | tipo (`CLIENTE`/`PROVEEDOR`), entidad_id, monto_cent, saldo_cent, estado (`ACTIVO`/`APLICADO`/`ANULADO`), caja_movimiento_id?/banco_movimiento_id? | se consumen al aplicarlos a recibos/pagos; el saldo nunca es negativo |
| `bancos_cuentas` | codigo, nombre, banco, numero_cuenta, tipo, saldo_inicial_cent, saldo_cent (caché), activa | `UNIQUE (empresa_id, codigo)` |
| `bancos_movimientos` | cuenta_id, fecha, tipo (`DEPOSITO`/`RETIRO`/`TRANSFERENCIA`/`CHEQUE`/`CARGO`/`INTERES`/`AJUSTE`), monto_cent firmado, conciliado, referencia, doc_tipo/doc_id | monto distinto de cero; ligado a su documento origen |
| `bancos_conciliaciones` / `bancos_conciliacion_lineas` | cuenta_id, fecha, período, saldo_banco_cent, saldo_libro_cent, diferencia_cent, estado; línea por movimiento | `UNIQUE (conciliacion_id, movimiento_id)`; marca los movimientos conciliados |
| `cajas` | codigo, nombre, almacen_id?, impresora_ticket, activa | caja principal sembrada en Fase 1 |
| `caja_sesiones` | caja_id, usuario_apertura, fecha_apertura, fondo_inicial_cent, fecha_cierre?, usuario_cierre_id, arqueo_efectivo_cent, arqueo_otros_cent, esperado_cent, diferencia_cent, estado | una sesión abierta por caja; arqueo y cierre auditados |
| `caja_movimientos` | sesion_id, tipo, metodo, monto_cent (+/-), doc_origen_tipo, doc_origen_id, usuario_id, fecha | inmutable; respaldo de cobros, pagos, gastos y comisiones en efectivo |
| `gastos_categorias` | codigo, nombre, activa | `UNIQUE (empresa_id, codigo)` |
| `gastos` | numero, categoria_id, proveedor_id?, concepto, monto_cent, impuesto_cent, total_cent, metodo (`EFECTIVO`/`BANCO`), recurrente_id?, caja_sesion_id?/banco_cuenta_id?, estado (`PENDIENTE`/`CONTABILIZADO`/`ANULADO`), doc_referencia | `UNIQUE (empresa_id, numero)`; el pago cambia el estado y crea la contrapartida |
| `gastos_recurrentes` | categoria_id, proveedor_id?, concepto, monto_cent, impuesto_cent, frecuencia, proxima_fecha, activa | genera gastos reales; no almacena un "recordatorio" simulado |
| `comisiones` | vendedor_id, doc_venta_id, base_cent, pct_bp, monto_cent, estado (`PENDIENTE`/`PAGADA`/`ANULADA`), metodo (`EFECTIVO`/`BANCO`), caja_movimiento_id?/banco_movimiento_id? | `UNIQUE (empresa_id, doc_venta_id, vendedor_id)`; regla `VENTA`/`COBRO` en el catálogo del vendedor |

Toda aplicación, anticipo, anulación y cierre se ejecuta en una transacción SQL y actualiza los
saldos cachados (`clientes.balance_cent`, `proveedores.balance_cent`,
`bancos_cuentas.saldo_cent`) junto con su movimiento. El discriminador opcional de
`cxc.detalle`/`cxp.detalle` (`DOCUMENTO | RECIBO | PAGO`) resuelve la colisión de IDs entre
facturas y comprobantes sin duplicar tablas. La adaptación fiscal RD permanece preparada para
e-CF, **sin afirmar certificación DGII**.

## Reportes (Fase 9, sin migración nueva)

No se añaden tablas ni columnas: todos los informes se derivan con SQL parametrizado sobre
datos reales y verifican permisos en el proceso principal.

| Vista / reporte | Origen de datos | Regla destacada |
|---|---|---|
| Indicadores y serie | `documentos_venta`, `documentos_compra`, `cxc_recibos`, `cxp_pagos`, `cxc_documentos`, `cxp_documentos`, `existencias`, `caja_sesiones` | fechas con `date('now')` / `start of month`; serie diaria o mensual |
| Ventas / Compras | `documentos_venta` / `documentos_compra` y sus líneas | notas de crédito y devoluciones con signo negativo; `es_ncf` y `numero_proveedor` |
| Inventario | `existencias` + `productos` + `almacenes` | `valorCent` solo con `reportes.costo` |
| CxC / CxP | `cxc_documentos` / `cxp_documentos` + movimientos | exigen además `cxc.consultar` / `cxp.consultar` |
| Libro 606 (borrador) | `documentos_compra` y líneas | NCF recibido del proveedor en `numero_proveedor`; devoluciones en negativo |
| Libro 607 (borrador) | `documentos_venta` y líneas | `es_ncf` de `series_documento`; notas de crédito en negativo |

Costo y ganancia se omiten en backend sin `reportes.costo` / `reportes.ganancia`. La impresión
entrega solo datos y usa `window.print()`; las exportaciones XLSX/CSV se generan con ExcelJS.
Los libros son borradores locales preparados para e-CF, **sin afirmar certificación DGII**.

## Reportes / Auditoría / Sistema

| Tabla | Campos clave |
|---|---|
| `auditoria` | id, fecha, usuario_id, empresa_id, sesion_id, operacion, entidad, entidad_id, valores_antes JSON, valores_despues JSON (sin `ip_equipo`; el equipo de la sesión está en `sesiones.equipo`) |
| `backups_historial` | id, fecha (hora local), ruta, tamano_bytes, tipo (`MANUAL`/`AUTO`/`PRE_RESTAURACION`), integridad_ok, usuario_id |
| `_migraciones` | version, nombre, aplicada_en |

La configuración de respaldos vive en `parametros` (`backup_carpeta`, `backup_frecuencia`,
`backup_hora`, `backup_retencion_dias`). La restauración usa además el archivo local
`restore-pending.json` en `%APPDATA%/enterprise-pro-erp`, con la copia elegida, el solicitante
y los datos de la copia previa; se consume antes de abrir SQLite. Las copias `PRE_RESTAURACION`
nunca se eliminan por retención.

Reportes = consultas SQL sobre estas tablas (vistas para ventas por período, antigüedad
de saldos, kardex valorado, flujo de caja). No se duplican datos de negocio.

## Relaciones entre módulos (flujo de una venta a crédito)

```
clientes ─┐
productos ─┼→ documentos_venta + lineas
almacenes ─┘        │ (transacción única)
                    ├→ movimientos_inventario (salida, costo vigente)
                    ├→ existencias (UPDATE, valida negativo según parámetro)
                    ├→ cxc_documentos (saldo = total)
                    ├→ caja_movimientos (si hubo pago contado/abono)
                    ├→ comisiones (si regla = venta)
                    ├→ series_documento (numeración/NCF atómica)
                    ├→ auditoria
                    └→ conduce (si entrega parcial)
```

Los balances cacheados (`clientes.balance_cent`, `existencias.cantidad`,
`bancos_cuentas.saldo_cent`) **solo** se modifican dentro de services transaccionales y
son reconciliables contra los movimientos (reporte de verificación de integridad).
