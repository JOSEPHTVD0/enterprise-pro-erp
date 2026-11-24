# ENTERPRISE PRO ERP

ERP administrativo y comercial de escritorio, 100 % local (sin Internet), para Windows 10/11.
Referencia funcional: SAINT Enterprise Administrativo. Código, diseño e identidad completamente originales.

## Estado del proyecto

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Análisis y arquitectura | ✅ Aprobada |
| 2 | Aplicación de escritorio (shell, UI, temas) | ✅ Completa y verificada |
| 3 | Seguridad y configuración | ✅ Completa y verificada |
| 4 | Maestros (clientes, proveedores, productos…) | ✅ Completa y verificada |
| 5 | Inventario | ✅ Completa y verificada |
| 6 | Ventas y POS | ✅ Completa y verificada |
| 7 | Compras | ✅ Completa y verificada |
| 8 | Finanzas (CxC, CxP, bancos, caja, gastos) | ✅ Completa y verificada |
| 9 | Reportes y estadísticas | ✅ Completa y verificada |
| 10 | Auditoría y respaldos | ✅ Completa y verificada |
| 11 | Pruebas integrales | ✅ Completa y verificada |
| 12 | Instalador Windows | ✅ Completa y verificada |

**Entrega final:** [docs/06-entrega-final.md](docs/06-entrega-final.md) ·
`dist\EnterpriseProERP-Setup-0.2.0.exe` · SHA-256
`DBAA5D31DCBD3C17D5B62094F649CF57ACF155D047DF9DAD2992D6B86746728F` ·
instalador **firmado de forma autofirmada** (SmartScreen no desaparece sin CA confiable).
Detalle del cierre de limitaciones: [docs/07-cierre-limitaciones.md](docs/07-cierre-limitaciones.md).

## Ejecución

```powershell
npm.cmd install
npm.cmd run dev        # aplicación Electron en modo desarrollo
npm.cmd run build      # compilar main + preload + renderer
npm.cmd test           # 190 pruebas (seguridad, IPC, BD real, PDF, maestros, inventario, ventas, POS, compras, finanzas, reportes, auditoría, respaldos, impresión, rendimiento, persistencia, Excel, UI)
npm.cmd run test:e2e   # 4 pruebas reales en Electron por CDP (Playwright)
npm.cmd run test:updater # verifica el feed local de electron-updater
npm.cmd run typecheck  # TypeScript estricto
```

### Primer arranque

- Usuario: `admin`
- Contraseña: `Admin1234!`
- El sistema **exige cambiar la contraseña** antes de mostrar el escritorio.
- Estas credenciales son de inicialización, no un usuario de demostración.

Los datos se guardan en `%APPDATA%/enterprise-pro-erp/data/enterprise.db` (SQLite con WAL).
Las sesiones se invalidan al cerrar la aplicación: el token vive solo en memoria del preload
y se almacena hasheado (SHA-256) en la tabla `sesiones`.

## Cierre de limitaciones (posterior a Fase 12)

- **Auditoría:** `zod@4.6.7` + `overrides.uuid=11.1.1`. `npm.cmd audit --omit=dev` → 0
  vulnerabilidades. Quedan 11 avisos de desarrollo que exigen actualizaciones mayores no
  autorizadas (Electron 45, Vitest 5, electron-builder 25).
- **PDF nativo:** pdfmake genera archivos reales en el proceso principal; hay botones
  «Guardar PDF» en ventas, compras, finanzas y reportes. La impresión nativa sigue disponible.
- **E2E:** Playwright se conecta por CDP a Electron; `npm.cmd run test:e2e` valida login, IPC de
  PDF, botón de descarga y consola limpia sin descargar navegadores.
- **Actualizaciones:** `electron-updater` con proveedor `generic`. El feed local se genera con
  `npm.cmd run release:feed` y se sirve con `npm.cmd run release:serve`. En producción debe
  sustituirse `build.publish.url` por una URL HTTPS (o definir `ERP_UPDATE_URL`).
- **Firma:** el instalador está firmado con certificado autofirmado mediante
  `scripts\firmar-instalador.ps1`. SmartScreen **no desaparece** sin certificado de CA pública.
- **Git:** repositorio inicializado con un único commit; artefactos y claves ignorados.
- **e-CF:** solo preparación; no hay emisión ni certificación DGII.

### Verificación de la Fase 3 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 49/49 pruebas.
- `npm.cmd run build`: main + preload + renderer compilados.
- Arranque Electron con CDP: login real, bloqueo backend del cambio obligatorio,
  cambio de clave, shell con datos SQLite, invalidación de sesión al reiniciar y BD en disco
  con migración 1, 149 permisos, 15 series y tokens hasheados de 64 caracteres.

### Verificación de la Fase 4 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 64/64 pruebas (CRUD, permisos, unicidad por empresa, referencias,
  historial de precios y Excel real con ExcelJS).
- `npm.cmd run build`: main + preload + renderer compilados.
- Arranque Electron con CDP y perfil aislado: login, modal obligatorio con bloqueo
  backend (`PASSWORD_CHANGE_REQUIRED`), alta **y edición real** de un cliente, botones
  Plantilla/Exportar/Importar con descarga verificada de `clientes_AAAA-MM-DD.xlsx`,
  carga de Proveedores/Productos/Catálogos/Vendedores y visor de auditoría; sin errores de consola.
- BD en disco: migraciones `[1,2]`, cliente persistido con `limite_credito_cent = 150050`,
  auditoría `CREAR` + `MODIFICAR`, clave inicial marcada como cambiada y 155 permisos sembrados.

Los maestros incluyen 8 entidades (clientes, proveedores, productos, categorías, marcas,
unidades, listas de precio y vendedores) con búsqueda instantánea, orden, paginación,
borrado lógico con verificación de referencias y exportación/importación Excel.
Los costos y precios requieren permiso específico y sus cambios quedan auditados.

### Verificación de la Fase 5 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 90/90 pruebas (dinero/costos, esquemas, kardex, transferencias, conteos,
  reversas, stock negativo, atomicidad, permisos, aislamiento por empresa y Excel).
- `npm.cmd run build`: main + preload + renderer compilados.
- Arranque Electron por CDP con perfil aislado: login, bloqueo del cambio obligatorio,
  alta real de producto desde la UI, movimiento de entrada de 10 unidades a RD$12.50 en el
  almacén principal, kardex con costos y saldos, **sin errores de consola**.
- BD en disco del perfil aislado: migraciones `[1,2,3]`, 1 movimiento inmutable,
  existencia `10 / 12500 centavos`, auditoría `CREAR`, series `AJU-`/`TRF-` y clave inicial
  ya cambiada (`debe_cambiar_clave = 0`).

El módulo **Inventario** ofrece existencias valoradas, kardex inmutable, movimientos manuales,
ajustes/conteos/pérdidas/daño, transferencias entre almacenes, reversas por movimientos
inversos, series/lotes y exportación Excel. El costo promedio se calcula en un único módulo
centralizado; las anulaciones nunca borran ni editan el kardex. La numeración de ajustes y
transferencias es interna (no NCF) y el stock negativo está desactivado por defecto.

### Verificación de la Fase 6 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 118/118 pruebas (esquemas, permisos por módulo, catálogos, numeración,
  ITBIS, facturación, POS, CxC, conduces, anulaciones y persistencia).
- `npm.cmd run build`: main + preload + renderer compilados.
- Arranque Electron por CDP con perfil aislado: login, cambio obligatorio de clave, alta real
  de cliente/producto y entrada de stock; factura de contado por RD$590.00 (2 unidades +
  ITBIS 18 %), factura a crédito por RD$295.00, apertura de caja y venta POS con pagos
  combinados (efectivo + tarjeta), anulación de la factura con nota de crédito y reversa de
  inventario; navegación real por Facturación, Punto de Venta y Cotizaciones/Pedidos.
- Reinicio **real del proceso** con el mismo perfil: sesión invalidada, login con la clave
  ya cambiada y los 4 documentos persistidos en SQLite (factura anulada, NC, crédito y POS),
  **sin errores de consola**.

El módulo **Facturación** emite facturas de contado/crédito, notas de crédito/débito,
devoluciones y conduces con entregas parciales. El **POS** exige caja abierta, admite pagos
combinados ligados a la sesión y permite suspender/recuperar ventas. **Cotizaciones y Pedidos**
no afectan stock ni generan CxC y se convierten a factura con trazabilidad. El ITBIS se calcula
por línea con un único motor compartido (`src/shared/impuestos.ts`); las series sembradas
`FAC-`/`FCR-`/`POS-`/`NC-` son internas (`es_ncf = 0`) y solo se usa una serie fiscal configurada
cuando existe, sin inventar NCF. La impresión usa las capacidades nativas de Electron
(`window.print()` con CSS `@media print`), sin añadir dependencias. La adaptación RD está
preparada para e-CF, **sin afirmar certificación DGII**.

### Verificación de la Fase 7 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 131/131 pruebas (incluidas 7 de integración de compras y 6 de esquemas Zod).
- `npm.cmd run build`: main + preload + renderer compilados.
- Arranque Electron por CDP con perfil aislado: login, bloqueo backend del cambio obligatorio
  (`PASSWORD_CHANGE_REQUIRED`), alta real de proveedor y producto, y recarga de catálogos en la UI.
- Flujo comprobado desde la interfaz: `SOL-00000001` → `OC-00000001` → recepción parcial
  `REC-00000001` (4 unidades) → factura `FCO-00000001` contra recepción, **sin duplicar el kardex**;
  su anulación tampoco generó reversa de stock. Factura directa a crédito `FCO-00000002` con
  gasto de RD$5.00 capitalizado (costo unitario RD$105.00 y CxP RD$123.00), cancelada al anularse;
  devolución `DCO-00000002` con reversa por costo promedio. Impresión de datos y exportación
  XLSX reales verificadas; las cinco pestañas responden con documentos persistidos.
- Reinicio **real del proceso** con el mismo perfil: sesión invalidada, login con la clave ya
  cambiada y 7 documentos en SQLite, saldo del proveedor en 0, existencia de 2 unidades por
  RD$58.00 y 4 movimientos inmutables en kardex, **sin errores de consola**.

El módulo **Compras** cubre solicitudes, órdenes, recepciones parciales, facturas de contado/crédito,
devoluciones y CxP básica. La recepción mueve stock; la factura contra recepción no lo duplica,
mientras que la factura directa o contra orden sí. El gasto asociado se capitaliza al costo y se
adeuda al proveedor sin volver a gravarse. El NCF o número de factura recibido del proveedor se
guarda como `numero_proveedor`: el ERP nunca lo genera ni afirma certificación DGII.

### Verificación de la Fase 8 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 145/145 pruebas (19 archivos; 75 de integración y 70 unitarios).
- `npm.cmd run build`: main + preload + renderer compilados.
- Arranque Electron por CDP con perfil aislado y puerto propio: login, bloqueo backend
  (`PASSWORD_CHANGE_REQUIRED`), cambio obligatorio de clave y 21 módulos activos con el badge
  `Fase 8 · Finanzas`.
- Datos reales preparados en SQLite: cliente, proveedor, producto, vendedor, entrada de stock,
  dos facturas de venta a crédito y dos de compra a crédito con ITBIS 18 %.
- Flujos ejecutados desde la interfaz y verificados por canal: apertura de caja; cuenta,
  movimiento y conciliación bancaria; recibo `RIN-00000001` y pago `PAG-00000001` aplicados a
  **dos facturas cada uno**; anticipos de cliente y proveedor; categoría, gasto y su pago;
  gasto recurrente con generación real; comisión de vendedor pagada (`PAGADA`); anulación de
  recibo y pago con motivo y restauración de saldos; movimiento manual, arqueo con diferencia
  de RD$5.00 y cierre de caja.
- Datos de impresión de los cuatro comprobantes y exportaciones XLSX reales de CxC y CxP
  verificados (≈6.7 KB cada uno); las cinco vistas financieras cargan sin errores de consola.
- Reinicio **real del proceso** con el mismo perfil: sesión invalidada, login con la clave ya
  cambiada y persistencia de maestros, documentos, anticipos, banco, caja, gastos y comisiones,
  **sin errores de consola**.
- Corrección incluida: `cxc.detalle`/`cxp.detalle` e impresión aceptan un discriminador
  `DOCUMENTO | RECIBO | PAGO` para evitar que un comprobante con el mismo ID que una factura
  muestre el documento equivocado.

### Verificación de la Fase 9 (real, no simulada)

- `npm.cmd run typecheck`: sin errores.
- `npm.cmd test`: 157/157 pruebas (21 archivos; 82 de integración y 75 unitarios), incluidas
  7 de integración de reportes y 5 de esquemas Zod.
- `npm.cmd run build`: main + preload + renderer compilados, con Recharts incluido.
- Arranque Electron por CDP con perfil aislado (`reportes-phase9-profile`, puerto 9225):
  login, bloqueo backend `PASSWORD_CHANGE_REQUIRED`, cambio obligatorio de clave, badge
  `Fase 9 · Reportes`, módulo Reportes activo y gráfica Recharts renderizada.
- Datos reales creados el mismo día: cliente, proveedor, producto, entrada de stock, factura
  de venta a crédito (RD$472.00), factura de compra (RD$236.00, NCF proveedor `B0100000999`),
  recibo de RD$100.00, pago de RD$50.00 y sesión de caja abierta.
- Indicadores y serie reconcilian con esos documentos: ventas del día RD$472.00, compras
  RD$236.00, CxC RD$372.00, CxP RD$186.00, ganancia RD$272.00; la serie diaria registra
  cobros RD$100.00 y pagos RD$50.00. Costos y ganancias se ocultan en backend sin permiso.
- Los ocho reportes consultan SQLite en tiempo real; se verificaron en la interfaz Ventas,
  Libro 607, Libro 606, Inventario y CxC, con sus totales y la fila del documento real.
- Exportaciones reales: XLSX de 6.867 bytes y CSV con el NCF del proveedor; datos de impresión
  del Libro 607 con cabecera de empresa y aviso explícito «no constituye certificación DGII».
- Reinicio **real del proceso** con el mismo perfil: sesión invalidada, login con la clave ya
  cambiada, mismos indicadores y mismos documentos en la UI, **sin errores de consola**.

El centro de **Reportes** ofrece ocho vistas (resumen, ventas, compras, inventario, CxC, CxP,
libros 606/607) con filtros por fecha, tipo y estado, exportación XLSX/CSV e impresión nativa.
Los libros son **borradores locales** derivados de documentos reales y preparados para e-CF;
el NCF del proveedor se guarda tal cual y el ERP **no afirma certificación DGII**. El panel de
inicio muestra indicadores y gráfica con datos reales.

### Fase 10 — Auditoría y respaldos

- El registro de auditoría ya existía desde la Fase 3; ahora se complementa con el módulo de
  respaldos: copias manuales y programadas, `PRAGMA integrity_check`, historial y restauración.
- Canales nuevos: `respaldos.historial`, `respaldos.crear`, `respaldos.integridad` y
  `respaldos.restaurar`, registrados como entradas `route(...)` sin tocar el bucle genérico
  del router ni el preload. Permisos verificados en backend (`respaldos.consultar`,
  `configuracion.respaldo.crear`, `configuracion.respaldo.restaurar`); los parámetros
  `backup_*` también están protegidos si se intenta alterarlos por `config.parametro.set`.
- La copia usa la API `backup()` de better-sqlite3, se verifica antes de registrarse y su
  creación queda auditada en la misma transacción. El programador corre dentro del proceso,
  evalúa cada 15 segundos y respeta frecuencia diaria/semanal/mensual y hora local.
- La restauración es por etapas: doble confirmación en la UI (la segunda exige escribir
  `RESTAURAR`), copia previa automática, marcador atómico en disco, reinicio controlado y
  reemplazo del archivo **antes de abrir SQLite**, eliminando WAL/SHM. Tras el reinicio se
  reconstruyen el historial y la auditoría de la operación en la BD restaurada.
- `npm.cmd test`: **166/166** pruebas en 23 archivos (87 de integración y 79 unitarios),
  incluidas 5 de respaldos reales y 4 de la lógica del programador (conteo al cierre de Fase 10;
  la suite final de Fase 11 tiene 181).
- Verificación Electron por CDP con perfil aislado (`auditoria-fase10-profile`, puerto 9226):
  copia real de 790.528 bytes íntegra, configuración guardada, auditoría `RESPALDO_CREADO`,
  doble confirmación con botón bloqueado/habilitado, cliente posterior eliminado tras
  restaurar, copia `PRE_RESTAURACION` registrada, auditoría `RESTAURAR_RESPALDO`,
  `RESPALDO_PRE_RESTAURACION` y `RESTAURACION_APLICADA`, sesión invalidada y
  **`consoleErrors: []`**. Evidencia en
  `C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase10-result.json`.
### Fase 11 — Pruebas integrales

- `npm.cmd test`: **181/181** pruebas en 27 archivos (102 de integración y 79 unitarios),
  sin dependencias nuevas ni cambios de arquitectura, BD o flujos financieros.
- **IP real del router**: `tests/integration/ipc-router.test.ts` monta `registerIpc` con
  `ipcMain.handle` mockeado y verifica, en el orden de producción, origen confiable, token,
  hash del token en BD, política `PASSWORD_CHANGE_REQUIRED`, permiso de ruta con un usuario
  real sin permisos, esquemas Zod y whitelist de catálogos, además de la expiración por
  inactividad. No se modificó el bucle genérico ni el preload.
- **Auditoría e impresión**: filtros de `listAudit` y permiso `auditoria.consultar`; datos reales
  de impresión de ventas, compras, CxC y CxP con cabecera, líneas y discriminador, además del
  aviso DGII en el libro 607 y la regla `@media print` del CSS.
- **Rendimiento**: 10.000 productos y 1.000 documentos insertados en transacción sobre SQLite
  real; se comprueban el listado/agregado, los totales (RD$11.800,00 por documento) y que
  `EXPLAIN QUERY PLAN` usa los índices `idx_productos_empresa` e
  `idx_docs_venta_empresa_fecha`.
- **Persistencia**: apertura en frío de un archivo SQLite real, conservación de maestros,
  auditoría y preferencias, e invalidación de sesiones por `initializeDatabase`. El reinicio
  **real del proceso** quedó verificado por CDP en fases anteriores y se repitió tras Fase 11.
- `npm.cmd run typecheck` y `npm.cmd run build`: limpios. Verificación Electron por CDP con
  perfil aislado y puerto 9226: login, cambio obligatorio, copia íntegra, restauración con
  doble confirmación, reinicio real, sesión invalidada y **`consoleErrors: []`**.
- Informe completo: [docs/04-informe-pruebas-fase11.md](docs/04-informe-pruebas-fase11.md).
### Fase 12 — Instalador Windows

- `npm.cmd run dist:win` genera `dist\EnterpriseProERP-Setup-0.2.0.exe` (124.221.568 bytes,
  SHA-256 `DBAA5D31DCBD3C17D5B62094F649CF57ACF155D047DF9DAD2992D6B86746728F`),
  NSIS x64 per-usuario, con icono original, accesos directos y carpeta configurable.
- `electron-builder@26.18.0` se instaló como dependencia de desarrollo; `npm.cmd run build`,
  `npm.cmd run typecheck` y `npm.cmd test` siguen limpios; la suite final es de **190/190** en 29 archivos.
- El paquete incluye `app.asar` y deja `better-sqlite3` fuera de ASAR (`asarUnpack`). Se usa
  `npmRebuild:false` porque los prebuilds Node-API del módulo funcionan en Electron 37.10.3;
  así se evita añadir `electron-rebuild`. Verificado arrancando el exe instalado con perfil
  aislado: BD creada, `integrity_check` = `ok`, versión 0.2.0 y sin errores de consola propios.
- Desinstalación: pregunta **Sí/No** antes de borrar `%APPDATA%\enterprise-pro-erp`. Se probaron
  ambas ramas con un centinela: **No conserva** y **Sí elimina** solo el directorio de datos;
  las actualizaciones no preguntan porque usan `${isUpdated}`.
- El instalador quedó sin firmar en la Fase 12; después se firmó con certificado **autofirmado**.
  Windows puede seguir mostrando SmartScreen: se requiere una CA pública para eliminarlo.
  No se afirma certificación DGII.
- Guía completa: [docs/05-instalacion-mantenimiento.md](docs/05-instalacion-mantenimiento.md).
- Decisión técnica: [docs/adr/0003-instalador-nsis.md](docs/adr/0003-instalador-nsis.md).
- Con esta fase, **las 12 fases del plan quedan completas**; no hay botones decorativos ni
  datos simulados.

## Documentación

- [docs/01-arquitectura.md](docs/01-arquitectura.md) — Arquitectura técnica, capas, IPC, seguridad.
- [docs/adr/](docs/adr/) — Decisiones técnicas aprobadas.
- [docs/02-modelo-datos.md](docs/02-modelo-datos.md) — Esquema SQLite, entidades, relaciones, reglas de integridad.
- [docs/03-plan-desarrollo.md](docs/03-plan-desarrollo.md) — Plan por fases, criterios de aceptación, riesgos y decisiones.
- [docs/04-informe-pruebas-fase11.md](docs/04-informe-pruebas-fase11.md) — Inventario, resultados, matriz de cobertura y limitaciones de la suite integral.
- [docs/05-instalacion-mantenimiento.md](docs/05-instalacion-mantenimiento.md) — Instalación, actualización, datos, respaldos y desinstalación.
- [docs/06-entrega-final.md](docs/06-entrega-final.md) — Estado final, artefacto, hash, verificación y limitaciones.
- [docs/07-cierre-limitaciones.md](docs/07-cierre-limitaciones.md) — PDF, E2E, updater, firma, Git y e-CF.
- [docs/08-guia-uso-y-publicacion.md](docs/08-guia-uso-y-publicacion.md) — Guía de instalación, uso, compilación, firma y publicación.

## Stack aprobado (Fase 1)

Electron · React · TypeScript · Vite (electron-vite) · Tailwind CSS · SQLite (better-sqlite3) ·
Zod · Lucide · ExcelJS · Vitest · Recharts · electron-builder/NSIS (instalados; Recharts se añadió
en Fase 9, electron-builder en Fase 12 y pdfmake/Playwright/electron-updater en el cierre posterior).
La impresión nativa usa `window.print()` y CSS de Electron; además hay PDF real generado con
pdfmake y E2E de Playwright por CDP.
`npm.cmd audit --omit=dev` reporta **0 vulnerabilidades de producción**; los 11 avisos de
desarrollo requieren cambios mayores no autorizados.

## Principios

1. Sin datos de demostración presentados como reales.
2. Toda operación financiera usa transacciones SQL reales; nada se simula.
3. Permisos verificados en el proceso principal (backend), no solo en la UI.
4. Documentos contabilizados nunca se borran: se anulan/reversan con trazabilidad.
5. Adaptación fiscal RD (DOP, RNC/cédula, ITBIS, NCF) preparada para e-CF, **sin afirmar certificación DGII**.
