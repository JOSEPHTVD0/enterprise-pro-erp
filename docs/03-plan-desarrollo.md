# 03 — Plan de Desarrollo, Riesgos y Decisiones

> Fase 1 · Cada fase se entrega funcional, probada y documentada antes de avanzar.
>
> Nota: los números de pruebas y las decisiones por fase corresponden a su momento histórico.
> El estado final, con 200 pruebas, Fase 13 y cierre de limitaciones, está en
> [docs/06-entrega-final.md](06-entrega-final.md),
> [docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md) y
> [docs/09-novedades-0.3.0.md](09-novedades-0.3.0.md).

## Fases y criterios de aceptación

### FASE 2 — Shell de escritorio ✅ COMPLETA Y VERIFICADA
Electron + electron-vite + React + Tailwind; ventana principal, layout (sidebar contraíble,
topbar, panel, barra de estado), navegación por 20 vistas, tema claro/oscuro/sistema persistente,
librería de componentes (Button, Badge, Card, Modal, Select, PageHeader, Toaster, ModulePlaceholder),
atajos (Ctrl+B), CSP, contextIsolation/sandbox, IPC tipado y verificado en el backend.
**Verificación:** `typecheck` limpio · 18 pruebas en verde · build de producción correcto ·
arranque real de Electron verificado por CDP (renderer hidratado vía IPC, sin errores) ·
persistencia de preferencias probada con lecturas simuladas de reinicio.

### FASE 3 — Seguridad y configuración ✅ COMPLETA Y VERIFICADA
SQLite + runner de migraciones; login con scrypt; sesiones hasheadas en memoria del preload;
roles/permisos granulares (149 permisos) verificados en main; CRUD usuarios/roles/departamentos;
bloqueo/desactivación y restablecimiento de contraseña; visor de auditoría y sesiones;
configuración real de empresa, parámetros, impuestos, monedas, tasas, series/NCF, almacenes,
cajas, impresoras y formatos; multi-empresa con datos aislados.
**Aceptación cumplida:** intento de operación sin permiso rechazado en backend (prueba
automática); cambio de permisos de rol aplicado al contexto activo; numeración atómica;
datos persisten en `%APPDATA%/enterprise-pro-erp/data/enterprise.db` verificados por lectura
directa con `better-sqlite3`; primer arranque crea `admin` y exige cambio de contraseña.
**Verificación:** `typecheck` limpio · 49/49 pruebas · build correcto · arranque Electron
por CDP con login real, bloqueo backend del cambio obligatorio, cambio de clave, invalidación
de sesión al reiniciar y BD en disco (migración 1, 3 roles, 149 permisos, 15 series).
Los errores de dominio conservan su código desde `ipcMain` hasta el renderer (el preload
sandbox no puede importar dependencias externas, por lo que la codificación vive en
`src/shared/ipc-error.ts`).

### FASE 4 — Maestros ✅ COMPLETA Y VERIFICADA
Clientes, proveedores, productos (todos los campos del brief), categorías, marcas, unidades,
listas de precio y vendedores: 8 entidades con migración `002_maestros`, repositorios
parametrizados por empresa y un único CRUD de renderer reutilizable con búsqueda instantánea,
orden y paginación. Borrado lógico con verificación de referencias, historial de precios,
costos/precios protegidos por permiso específico y plantilla/import/export Excel real (ExcelJS).
**Aceptación cumplida:** validaciones Zod compartidas, permisos verificados en main antes de
validar el payload, unicidad por empresa, integridad referencial, transacciones y auditoría;
importación Excel probada con filas válidas, duplicados y errores por fila.
**Verificación:** `typecheck` limpio · 64/64 pruebas · build correcto · arranque Electron por
CDP con perfil aislado (alta y edición reales, descarga de `.xlsx`, módulos y auditoría sin
errores de consola) · BD en disco con migraciones `[1,2]`, auditoría `CREAR`/`MODIFICAR`
y 155 permisos.
**Decisiones de esta fase:** se añadió el módulo `proveedores` y el permiso `vendedores.exportar`
al catálogo (149 → 155); ExcelJS ya estaba aprobado en el stack de la Fase 1.

### FASE 5 — Inventario ✅ COMPLETA Y VERIFICADA
Existencias físicas y valoradas por almacén, kardex inmutable con saldos por movimiento,
transferencias, ajustes/conteos/pérdidas/daño, costo promedio ponderado centralizado,
series y lotes, bloqueo de stock negativo configurable y exportación Excel.
Migración `003_inventario` (9 tablas, triggers de inmutabilidad, índices y 2 series internas),
repositorio parametrizado por empresa, servicio transaccional con auditoría, rutas IPC con el
orden sesión → permiso → Zod → servicio, y 5 pestañas reales en el renderer.
**Aceptación cumplida:** fórmulas de dinero/costo cubiertas por Vitest; entradas, salidas,
transferencias, conteos y reversas cuadran con el kardex y las existencias; fallo inducido en
la segunda línea de una transferencia revierte cabecera, movimientos, saldos y numeración;
permisos verificados en backend (costos ocultos sin `inventario.costo`); series/lotes solo para
productos configurados; Excel real generado con ExcelJS.
**Verificación:** `typecheck` limpio · 90/90 pruebas · build correcto · arranque Electron por
CDP con perfil aislado: cambio obligatorio de clave, alta de producto desde la UI, movimiento
real de 10 unidades a RD$12.50, kardex con costos y **sin errores de consola**; SQLite en disco
con migraciones `[1,2,3]`, 1 movimiento, existencia `10 / 12500 centavos`, auditoría y series
`AJU-`/`TRF-`.
**Decisiones de esta fase:** se reutilizó el stack aprobado (sin tecnologías nuevas); el
redondeo se unificó en `src/shared/dinero.ts` para main y renderer; la numeración de ajustes y
transferencias usa series internas atómicas (no NCF, sin implicaciones fiscales); las anulaciones
son movimientos inversos para preservar el kardex.

### FASE 6 — Ventas + POS ✅ COMPLETA Y VERIFICADA
Facturación completa (contado/crédito/POS), cotizaciones/pedidos convertibles con trazabilidad,
devoluciones, notas de crédito/débito, conduces con entregas parciales, POS con caja, pagos
combinados y ventas suspendidas, e impresión nativa en formatos carta/media/80 mm/58 mm.

**Aceptación cumplida:** la venta es atómica (stock↓, CxC o caja↑, kardex, auditoría y
documento imprimible); la anulación crea NC y movimientos inversos sin borrar el kardex;
las cotizaciones/pedidos no afectan inventario ni generan CxC; los ITBIS y descuentos se
calculan en un único motor compartido (`src/shared/impuestos.ts`); los permisos se validan
en backend por módulo, incluidos detalle, anulación, impresión y conversión (una conversión
a factura exige `ventas.crear`).

**Verificación:** `typecheck` limpio · 118/118 pruebas (15 de integración de ventas) ·
build correcto · arranque Electron por CDP con perfil aislado: login, cambio obligatorio,
alta de cliente/producto/stock, factura de contado RD$590.00, factura a crédito RD$295.00,
POS con pagos combinados, anulación con reversa y navegación por las tres vistas nuevas;
reinicio real del proceso con el mismo perfil y persistencia de los 4 documentos en SQLite,
sin errores de consola.

**Decisiones de esta fase:** sin tecnologías nuevas; la numeración sembrada `FAC-`/`FCR-`/
`POS-`/`NC-` es interna (`es_ncf = 0`) y el NCF solo se toma de una serie fiscal configurada,
nunca se inventa; la impresión usa `window.print()` con CSS `@media print` en lugar de añadir
`pdfmake`; los efectos automáticos en CxC/caja se limitan a lo necesario para vender (los
abonos multi-factura, arqueo/cierre y bancos quedan para Fase 8); la arquitectura fiscal RD
está preparada para e-CF, **sin afirmar certificación DGII**.

### FASE 7 — Compras ✅ COMPLETA Y VERIFICADA
Solicitudes, órdenes, recepciones parciales, facturas de compra contado/crédito, devoluciones,
gastos asociados, CxP básica y actualización del costo promedio. Migración `005_compras`
(5 tipos de documento, líneas con recibido/devuelto, pagos, CxP y 5 series internas),
repositorios y servicio transaccional, rutas `compras.*` con el orden sesión → permiso → Zod →
servicio, y cinco pestañas reales en el renderer.

**Aceptación cumplida:** la compra actualiza inventario, costo y CxP en una sola transacción;
la recepción mueve stock y la factura contra recepción no lo duplica; la factura directa o contra
orden sí mueve stock. El gasto por línea se capitaliza al costo (`baseCent + gastoCent`) y se
adeuda al proveedor sin volver a gravarse. Las anulaciones y devoluciones crean movimientos
inversos sin borrar ni editar el kardex; una devolución explícita de factura originada en
recepción se rechaza y su anulación no genera reversa. La CxP se abre al facturar a crédito, se
abona con devoluciones y se cancela con movimiento `ANULACION` al anular la factura. Los permisos
se verifican en backend, incluidos catálogos, detalle, impresión y exportación.

**Verificación:** `typecheck` limpio · 131/131 pruebas (7 de integración de compras y 6 de
esquemas) · build correcto · arranque Electron por CDP con perfil aislado: login, cambio
obligatorio, alta de proveedor/producto, solicitud → orden → recepción parcial → factura contra
recepción → anulación, factura a crédito con gasto capitalizado y CxP cancelada al anular,
devolución con reversa, datos de impresión y exportación XLSX; reinicio real del proceso con
persistencia de 7 documentos, saldo de proveedor 0, 2 unidades por RD$58.00 y 4 movimientos de
kardex, sin errores de consola.

**Decisiones de esta fase:** sin tecnologías nuevas; se reutilizaron `movimientoDocumento`,
`calcularLinea`, `resumenLineas`, `nextSerieNumber`, `writeAudit` y el router genérico existente.
Las series `SOL-`/`OC-`/`REC-`/`FCO-`/`DCO-` son internas; el NCF recibido del proveedor se guarda
como `numero_proveedor` y nunca se inventa. La impresión sigue siendo nativa (`window.print()` y
CSS `@media print`). La adaptación RD permanece preparada para e-CF, **sin afirmar certificación
DGII**.

### FASE 8 — Finanzas ✅ Completa y verificada
CxC/CxP con abonos multi-factura, anticipos, antigüedad de saldos y recibos/pagos; bancos
(depósitos, retiros, transferencias, cheques y conciliación por movimientos); cajas
(apertura, movimientos manuales, arqueo con diferencia, cierre e historial); gastos,
categorías y recurrentes; comisiones de vendedores con regla por venta/cobro.

**Aceptación cumplida:** el recibo `RIN-00000001` aplicó RD$50.00 a cada una de dos facturas
y el pago `PAG-00000001` aplicó RD$40.00 a cada una de dos compras; las anulaciones restauraron
los cuatro saldos originales. El cierre de caja registró una diferencia real de RD$5.00.
Todo movimiento de banco/caja queda ligado a su documento origen y las conciliaciones marcan
los movimientos seleccionados. Los permisos finos (`cxc.*`, `cxp.*`, `bancos.*`, `cajas.*`,
`gastos.*`) se verifican en backend; la impresión entrega solo datos y usa `window.print()`.

**Verificación:** `typecheck` limpio · 145/145 pruebas en 19 archivos (75 de integración y
70 unitarios) · build correcto · arranque Electron por CDP con perfil aislado:
login, bloqueo `PASSWORD_CHANGE_REQUIRED`, cambio obligatorio de clave, catálogos reales,
cinco vistas financieras, cobro/pago multi-factura, anticipos, banco y conciliación, arqueo
con diferencia, gasto/recurrente/comisión, anulaciones, datos de impresión y XLSX real;
reinicio real del proceso con persistencia y sesión invalidada, sin errores de consola.

**Decisiones de esta fase:** migración `006_finanzas`; dinero siempre en centavos enteros;
contrapartida bancaria para todo método distinto de `EFECTIVO`; series internas `PAG-`/`GAS-`;
los comprobantes no se borran, se anulan con motivo. `cxc.detalle`/`cxp.detalle` e impresión
aceptan un discriminador opcional (`DOCUMENTO | RECIBO | PAGO`) porque recibo/pago y factura
pueden compartir ID numérico; la UI envía el tipo según la pestaña activa. Canales nuevos:
`finanzas.catalogos`; `cxc.documentos/detalle/recibo.crear/recibo.anular/anticipo.crear/anticipos/recibos/imprimir.datos/exportar`;
`cxp.documentos/detalle/pago.crear/pago.anular/anticipo.crear/anticipos/pagos/imprimir.datos/exportar`;
`bancos.cuentas/cuenta.crear/movimientos/movimiento.crear/movimiento.anular/conciliaciones/conciliacion.crear/imprimir.datos`;
`cajas.sesiones/detalle/abrir/cerrar/movimiento.crear/imprimir.datos`;
`gastos.categorias/categoria.crear/documentos/detalle/crear/pagar/anular/recurrentes/recurrente.crear/recurrente.generar`;
`comisiones.list/crear/pagar`. Sin tecnologías nuevas y sin tocar el router genérico ni el
preload. La adaptación RD sigue preparada para e-CF, **sin afirmar certificación DGII**.

### FASE 9 — Reportes y estadísticas ✅ COMPLETA Y VERIFICADA
Dashboard con indicadores y gráficas Recharts alimentados por SQLite; centro de reportes con
ocho vistas (resumen, ventas, compras, inventario, CxC, CxP, libros 606/607), filtros por
fecha/tipo/estado, exportación XLSX/CSV e impresión nativa (`window.print()`).

**Aceptación cumplida:** los indicadores, la serie temporal y los totales de cada reporte
reconcilian con documentos reales; notas de crédito y devoluciones aplican signo negativo;
costo y ganancia se ocultan en backend si falta `reportes.costo`/`reportes.ganancia`; CxC y
CxP exigen además su permiso de módulo. Los libros 606/607 son borradores locales derivados
de `documentos_compra`/`documentos_venta` y sus líneas, con el NCF del proveedor tal cual se
recibió en `numero_proveedor`; la arquitectura está preparada para e-CF, **sin afirmar
certificación DGII**.

**Verificación:** `typecheck` limpio · 157/157 pruebas en 21 archivos (82 de integración y
75 unitarios; 7 nuevas de integración de reportes y 5 de esquemas Zod) · build correcto ·
arranque Electron por CDP con perfil aislado (`reportes-phase9-profile`, puerto 9225): badge
`Fase 9 · Reportes`, módulo activo, gráfica renderizada, indicadores reales (ventas RD$472.00,
compras RD$236.00, CxC RD$372.00, CxP RD$186.00, ganancia RD$272.00), serie con cobros
RD$100.00 y pagos RD$50.00, cinco vistas con datos reales, XLSX de 6.867 bytes, CSV con NCF
y datos de impresión con aviso DGII; reinicio real del proceso con persistencia, sesión
invalidada y **sin errores de consola**.

**Decisiones de esta fase:** Recharts se instaló por estar en el stack aprobado; pdfmake sigue
sin instalarse y la impresión continúa siendo nativa, sin PDF generado. No se creó migración:
`series_documento` ya contiene `es_ncf`, rangos y vencimiento, y los libros se derivan de
documentos reales. Canales nuevos: `reportes.indicadores`, `reportes.serie`,
`reportes.consultar`, `reportes.exportar`, `reportes.imprimir`, registrados como entradas
`route(...)` sin modificar el bucle genérico del router ni el preload. `descargarArchivo`
acepta MIME opcional para CSV. La adaptación RD sigue preparada para e-CF, **sin afirmar
certificación DGII**.

### FASE 10 — Auditoría y respaldos (completa y verificada)
El visor de auditoría y el registro transaccional ya funcionaban desde la Fase 3. Se añadió el
módulo de respaldos con copias manuales y programadas, verificación real de integridad,
historial y restauración por etapas con copia previa y doble confirmación.

**Implementación:** sin migración nueva; se usan `backups_historial`, los parámetros `backup_*`,
los permisos existentes y la API `backup()` de better-sqlite3. Nuevos canales `respaldos.historial`,
`respaldos.crear`, `respaldos.integridad` y `respaldos.restaurar` como entradas `route(...)`,
sin modificar el bucle genérico del router ni el preload. El programador es interno, evalúa cada
15 segundos y usa hora local; las fechas de copia se guardan con `datetime('now','localtime')`
para que el cálculo de períodos sea consistente. La restauración escribe un marcador atómico,
cierra SQLite, reinicia Electron y reemplaza la BD antes de abrirla, eliminando WAL/SHM; después
reconstruye historial y auditoría de la operación en la copia restaurada.

**Aceptación:** restauración probada de punta a punta (cliente creado después de la copia
desaparece tras el reinicio, copia `PRE_RESTAURACION` y tres eventos de auditoría presentes);
backup automático verificado por lógica pura del programador y copia manual íntegra por CDP.
166/166 pruebas, typecheck y build limpios.

### FASE 11 — Pruebas integrales (completa y verificada)
Se cerró la brecha principal de la suite: el router IPC real ahora se ejerce con
`ipcMain.handle` mockeado, sin tocar el bucle genérico ni el preload. Se añadieron pruebas de
auditoría filtrada, impresión con datos reales (ventas, compras, CxC, CxP, libro 607 y CSS
`@media print`), rendimiento (10k productos y 1k documentos con uso confirmado de índices) y
persistencia en frío (reapertura de SQLite, auditoría y preferencias, e invalidación de sesiones
en `initializeDatabase`). El reinicio real del proceso se mantiene verificado por CDP.

**Aceptación:** suite verde con **181/181** pruebas en 27 archivos (102 de integración y 79
unitarios), `typecheck` y `build` limpios, verificación Electron por CDP con
`consoleErrors: []`, e informe en `docs/04-informe-pruebas-fase11.md`. Sin dependencias nuevas.

### FASE 12 — Instalador (completa y verificada)
Se instaló `electron-builder@26.18.0` (autorizado por el propietario) y se generó
`dist\EnterpriseProERP-Setup-0.2.0.exe` con NSIS x64 per-usuario, icono original, accesos
directos y carpeta configurable. Los datos siguen en `%APPDATA%\enterprise-pro-erp`; el
desinstalador pregunta Sí/No antes de borrarlos y no pregunta durante actualizaciones.

**Aceptación:** suite verde (181/181 en 27 archivos), `typecheck` y `build` limpios;
instalación silenciosa y arranque real del exe instalado con perfil aislado (Electron 37.10.3,
SQLite íntegro, versión 0.2.0, sin errores propios de consola); desinstalación verificada en
ambas ramas con centinela. Documentación en `docs/05-instalacion-mantenimiento.md` y decisión
en `docs/adr/0003-instalador-nsis.md`. El instalador quedó sin firmar digitalmente; después se
firmó con certificado autofirmado y en 0.3.0 se actualizó a electron-builder 26.18.1.

### FASE 13 — Ampliaciones 2026 (completa y verificada, versión 0.3.0)
Con autorización para cambios de esquema, dependencias mayores y flujos financieros, se añadió
la migración `007` (presupuestos, servicios, activos y CRM), preferencias avanzadas, panel
ejecutivo y panel de salud. Las dependencias mayores pendientes se actualizaron a Electron
45.4.1, Vitest 5.1.1 y electron-builder 26.18.1, con `audit` en cero.

**Aceptación:** suite verde **200/200** en 30 archivos, `typecheck` y `build` limpios,
E2E 4/4, updater detectando `0.3.1`, 30 módulos activos, instalador 0.3.0 firmado y feed
regenerado tras la firma. Detalle en `docs/09-novedades-0.3.0.md`.

## Riesgos identificados y mitigaciones

| # | Riesgo | Mitigación |
|---|--------|-----------|
| 1 | **better-sqlite3 es módulo nativo**: requiere rebuild para Electron | Versión `^13.2.0` verificada con Node 24 y Electron 45.4.1 mediante prebuilds Node-API (`NAPI_VERSION=10`). El paquete usa `asarUnpack` y `npmRebuild:false`, verificado arrancando el exe instalado; no hizo falta `electron-rebuild`. Alternativa de respaldo: `node:sqlite` (Node 22+). |
| 2 | Errores de redondeo en ITBIS/dinero | Centavos enteros + módulo `core/dinero` único con reglas de redondeo, cubierto por pruebas antes de usarse. |
| 3 | Costo promedio corrupto por operaciones fuera de orden | Cálculo centralizado, transacciones inmediatas, kardex inmutable como fuente de verdad reconciliable. |
| 4 | Impresión térmica variable según impresora | Formatos 58/80 mm con CSS de impresión dedicado; pruebas con PDF como referencia; configuración por caja. |
| 5 | Archivo de BD corrupto por corte de energía | WAL + checkpoints + backups automáticos con `integrity_check`; restauración guiada. |
| 6 | Alcance enorme (23 módulos activos) | Fases estrictas con criterios de aceptación; nada de TODO en funciones esenciales; cada fase usable. |
| 7 | e-CF DGII requiere certificación | Arquitectura preparada (campos NCF, series, XML futuro) pero se comunica claramente "no certificado". |
| 8 | Rendimiento con tablas grandes | Índices desde la migración 001, paginación server-side en DataTable, consultas de dashboard agregadas. |
| 9 | PowerShell restringido en este equipo | Scripts vía `npm.cmd`; no afecta al instalador final. |

## Decisiones que requieren tu autorización

1. **better-sqlite3 en lugar de Prisma** (permitido por el brief como "alternativa estable").
   Motivo: transacciones síncronas atómicas, mejor rendimiento en escritorio, sin motor
   binario extra. Afecta: capa de repositorios y migraciones (SQL manual versionado).
2. **Dinero en centavos enteros** en toda la BD (no REAL). Afecta: todos los módulos financieros.
3. **Zustand + React Query** para estado del renderer (no impuesto por el brief).
4. **pdfmake** como librería PDF (el brief no fija una).
5. **Datos en `%APPDATA%/enterprise-pro-erp`** separados del directorio de instalación.
6. **Numeración interna + NCF independientes** con series configurables por tipo de documento.

## Estándares de código

- TypeScript estricto (`strict: true`), sin `any` injustificado.
- Un módulo = carpeta propia en services / repositories / schemas / features / tests.
- SQL solo en repositories, siempre parametrizado.
- Toda operación crítica: transacción + auditoría + prueba.
- Commits/documentación por fase; README actualizado al cerrar cada fase.
- ADRs (registros de decisión) en `docs/adr/` cuando se apruebe una decisión relevante.
