# Informe de pruebas — Fase 11 (Pruebas integrales)

Fecha: 24 de noviembre de 2026 · Proyecto: ENTERPRISE PRO ERP · Plataforma: Windows 10/11, Node.js, Electron 37, Vitest 3.2.

> Informe histórico de la Fase 11 (Electron 37, Vitest 3.2). La suite final de 0.3.0 es de
> **200/200** pruebas con Electron 45.4.1 y Vitest 5.1.1, e incluye E2E con Playwright;
> véase [docs/06-entrega-final.md](06-entrega-final.md),
> [docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md) y
> [docs/09-novedades-0.3.0.md](09-novedades-0.3.0.md).

## 1. Alcance

La fase se ejecutó **sin añadir dependencias** y sin cambios de arquitectura, esquema SQLite, preload ni flujos financieros. La suite existente ya cubría reglas de negocio y permisos a nivel de servicio; la brecha identificada era la **ausencia de pruebas sobre el router IPC real** (`src/main/ipc/router.ts:705-727`). Se cerró esa brecha y se completaron las cinco áreas del criterio de aceptación.

## 2. Resultados ejecutados

| Comando | Resultado |
|---|---|
| `npm.cmd run typecheck` | Sin errores (`tsc --noEmit`). |
| `npm.cmd test` | **181/181** pruebas, **27 archivos**, 6,38 s (102 integración + 79 unitarios). |
| `npm.cmd run build` | main (420,71 kB), preload (1,52 kB) y renderer (2,37 MB) compilados. |
| `node C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase10.mjs` | Flujo Electron real completo, `consoleErrors: []`. Evidencia: `C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase10-result.json`. |

La verificación CDP ejecutada tras la Fase 11 usó perfil aislado `auditoria-fase10-profile`, puerto 9226 y proceso Electron real: login con cambio obligatorio de clave, badge de fase, módulo de respaldos, copia manual íntegra de 790.528 bytes, configuración del programador, restauración con doble confirmación, **reinicio real del proceso**, cliente posterior ausente, copia `PRE_RESTAURACION` registrada, tres eventos de auditoría presentes y sesión invalidada.

## 3. Inventario de la suite

### Integración — 13 archivos, 102 pruebas

| Archivo | Pruebas | Foco |
|---|---:|---|
| `tests/integration/auth.test.ts` | 12 | migraciones, login, bloqueo, tokens, cambio de clave, permisos. |
| `tests/integration/maestros.test.ts` | 12 | CRUD, unicidad, precios, importación/exportación, multiempresa. |
| `tests/integration/inventario.test.ts` | 12 | movimientos, promedio, transferencias, series/lotes, atomicidad. |
| `tests/integration/ventas.test.ts` | 15 | facturas, POS, anulación, conversiones, NCF, impresión. |
| `tests/integration/compras.test.ts` | 7 | facturas, CxP, recepciones, devoluciones, capitalización. |
| `tests/integration/finanzas.test.ts` | 9 | recibos, pagos, anticipos, conciliación, caja, gastos. |
| `tests/integration/configuracion.test.ts` | 8 | parámetros, numeración, auditoría transaccional, aislamiento. |
| `tests/integration/reportes.test.ts` | 7 | indicadores, serie, 606/607, XLSX/CSV, datos de impresión. |
| `tests/integration/respaldos.test.ts` | 5 | copia real, integridad, permisos, retención, restauración por etapas. |
| **`tests/integration/ipc-router.test.ts`** | **7** | **nuevo: router IPC real, seguridad y validación.** |
| **`tests/integration/auditoria-impresion.test.ts`** | **4** | **nuevo: filtros de auditoría e impresión real.** |
| **`tests/integration/rendimiento.test.ts`** | **2** | **nuevo: 10k productos y 1k documentos.** |
| **`tests/integration/persistencia.test.ts`** | **2** | **nuevo: arranque en frío e invalidación de sesiones.** |

### Unitarios — 14 archivos, 79 pruebas

`seguridad-esquemas` 11, `costos` 7, `impuestos` 7, `settings` 7, `ventas-esquemas` 6, `compras-esquemas` 6, `main-settings` 6, `reportes-esquemas` 5, `finanzas-esquemas` 5, `modules` 5, `respaldos-programador` 4, `inventario-esquemas` 4, `maestros-esquemas` 3, `dinero` 3.

## 4. Cobertura por área de aceptación

| Área | Cobertura | Evidencia principal |
|---|---|---|
| Funcional | Maestros, inventario, ventas/POS, compras, finanzas, reportes, respaldos y auditoría sobre SQLite real. | 87 pruebas de integración de fases 4-10. |
| Integración | Los 4 canales `respaldos.*` y el router completo con 150 manejadores registrados. | `ipc-router.test.ts`, `respaldos.test.ts`. |
| Seguridad (permisos/IPC) | Origen no confiable → `FORBIDDEN`; sin token/inválido/expirado → `UNAUTHORIZED`; token guardado como hash; política de cambio de clave con allowlist; permiso de ruta con usuario real sin permisos; Zod y whitelist de catálogos. | `ipc-router.test.ts` (7). |
| Rendimiento | 10.000 productos y 1.000 documentos insertados en transacción; listado y agregado verificados; `EXPLAIN QUERY PLAN` usa `idx_productos_empresa` e `idx_docs_venta_empresa_fecha`. | `rendimiento.test.ts` (2, timeout 30 s). |
| Persistencia | Cierre y reapertura de un archivo SQLite real con maestros, auditoría y preferencias intactos; `initializeDatabase` invalida sesiones. Reinicio real del proceso verificado por CDP. | `persistencia.test.ts` (2) + evidencia CDP. |
| Impresión | Datos reales de ventas (4 formatos), compras, CxC/CxP con discriminador, aviso DGII en libro 607 y `@media print`. | `auditoria-impresion.test.ts` (4). |

## 5. Decisiones y límites

- Los tests del router usan `vi.mock('electron')` para capturar `ipcMain.handle`; **no se modificó** `isTrusted`, `buildContext`, `assertCanProceed`, la verificación de permiso de ruta, `schema.parse`, `encodeIpcError` ni `src/preload/index.ts`.
- El "kill de proceso" se verifica con el reinicio real de Electron mediante CDP, no desde Vitest: un proceso hijo dentro de Vitest no reproduciría el ciclo de arranque de `app.relaunch()`. En Vitest se automatizó el equivalente en frío (cerrar, reabrir e invalidar sesiones).
- Los umbrales de rendimiento (inserción < 15 s, consulta < 8 s; timeout de prueba 30 s) evitan depender de la velocidad de la máquina y no sustituyen a las aserciones funcionales. En esta corrida las dos pruebas tardaron menos de 1 s.
- No se instalaron Playwright ni pdfmake: la impresión se prueba sobre datos y CSS, y la UI real se ejerce con CDP. `electron-builder` se instaló después, en Fase 12, sin afectar esta suite. Esto se documenta en `README.md` y `docs/01-arquitectura.md`.
- `npm audit` continúa con 8 vulnerabilidades conocidas; no se aplicó `npm audit fix --force` ni se cambiaron dependencias sin autorización.

## 6. Conclusión

La Fase 11 cumple su criterio de aceptación: suite verde, informe en `docs`, cobertura de las seis áreas solicitadas y ejecución real de Electron sin errores de consola. La **Fase 12 — Instalador Windows** se completó y verificó posteriormente; no queda ninguna fase pendiente del plan.
