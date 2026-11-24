# Novedades y verificación — ENTERPRISE PRO ERP 0.3.0

Fecha: 24 de noviembre de 2026 · Plataforma: Windows 10/11 x64 ·
Estado: **Fase 13 completada; 30 módulos activos y 0 pendientes**.

## 1. Alcance

Esta versión mantiene la arquitectura de seguridad aprobada (Context Isolation activo,
Node Integration desactivado, IPC con origen confiable, permisos y auditoría en backend) y
añade configuración avanzada, paneles ejecutivos y cuatro módulos nuevos. Se autorizaron
cambios de esquema, dependencias mayores y flujos financieros, todos cubiertos por la
migración versionada `007` y por transacciones SQLite reales.

**No se afirma certificación DGII ni emisión de e-CF.** Solo se conserva la preparación,
el uso de NCF y los libros 606/607 derivados de documentos reales.

## 2. Correcciones de desarrollo

| Tema | Cambio |
|---|---|
| Dependencias | Electron `45.4.1`, Vitest `5.1.1`, electron-builder `26.18.1`; `zod@4.6.7` con `overrides.uuid=11.1.1`. |
| Auditoría | `npm.cmd audit` y `npm.cmd audit --omit=dev`: **0 vulnerabilidades**. |
| electron-builder + Node 24 | `scripts/dist-win.mjs` precarga `scripts/compat-execfile.cjs` para fusionar el entorno del stub NSIS y evitar `spawn UNKNOWN`. |
| Overrides de auditoría | `uuid@11.1.1`, `minimatch@^11.0.9` y `@electron/universal@3.0.6` eliminan los advisories de desarrollo sin afectar el NSIS de Windows. |
| Construcción repetible | `scripts/dist-win.mjs` limpia `dist/win-unpacked` con reintentos antes de compilar; evita el fallo de renombrado de `electron.exe` en Windows. |
| Zod 4 | `conDefaultsDeObjetoVacio()` en `src/shared/schemas/defaults.ts` evita que `.default({})` deje grupos sin valores al reparsear. |
| Permisos | Se corrigieron las acciones cuya clave tiene dos segmentos para que no se incumpliera `operacion TEXT NOT NULL` al sembrarlos. |
| Verificador de updater | `scripts/verificar-updater.mjs` calcula la versión del feed como parche siguiente de `package.json`; ya no queda fija en `0.2.1`. |

El bucle genérico de `src/main/ipc/router.ts` y `src/preload/index.ts` **no se modificaron**:
las rutas nuevas se registraron como entradas `route(...)` adicionales.

## 3. Configuración avanzada

`src/shared/settings.ts` persiste el objeto completo de preferencias, con grupos:

- **Interfaz:** densidad, tamaño de fuente, idioma, acento, animaciones, tooltips,
  confirmaciones y tamaño de página.
- **Impresión:** formato, impresora, impresión automática, logo, pie, copias y márgenes.
- **Actualizaciones:** canal, búsqueda al iniciar, descarga automática y notificaciones.
- **Seguridad:** bloqueo al salir, visibilidad de sesiones, aviso de expiración,
  enmascaramiento de RNC y exigencia de clave para anular.
- **Respaldos:** recordatorio, inclusión de preferencias, compresión y verificación.
- **Fiscal:** moneda, decimales, formato de fecha, libros 606/607 y recordatorio NCF.
- **Panel:** visibilidad de utilidad, costos y salud; serie por defecto y filas del dashboard.

Los defaults se derivan del propio esquema Zod (`defaultSettings = settingsSchema.parse({})`).
Las políticas duras de sesión, permisos e intentos fallidos siguen en el backend y no pueden
relajarse desde la interfaz.

## 4. Paneles nuevos

### Panel ejecutivo

Calcula KPIs de ventas, compras, cobros y pagos sobre documentos reales. La utilidad solo se
muestra cuando el contexto tiene `reportes.ganancia`. Incluye serie mensual, formas de pago,
principales clientes, alertas y exportación CSV.

### Salud del sistema

Comprueba `PRAGMA integrity_check`, recuento de tablas/índices/registros, series, permisos,
último respaldo y versión de Electron. Requiere `salud.consultar`.

## 5. Módulos nuevos (migración 007)

| Módulo | Tablas | Operación destacada | Permiso |
|---|---|---|---|
| Presupuestos | `presupuestos`, `presupuesto_lineas` | Borrador → aprobado → ejecución parcial controlada; impide exceder el monto. | `presupuestos.*` |
| Servicios | `servicios_catalogo`, `ordenes_servicio`, `orden_servicio_lineas` | Orden con ITBIS por tasa `bp`, técnicos y cierre de estado. | `servicios.*` |
| Activos fijos | `activos`, `activos_depreciaciones` | Depreciación lineal mensual única por periodo y valor neto. | `activos.*` |
| CRM | `crm_leads`, `crm_seguimientos` | Seguimiento y conversión a cliente real sin duplicados. | `crm.*` |

Se añadieron índices por empresa/estado/periodo y las series `PRESUPUESTO`, `ORDEN_SERVICIO`,
`ACTIVO` y `LEAD` con prefijos `PRE-`, `OS-`, `ACT-` y `LED-`. Todas las escrituras usan
transacciones y registran auditoría; los permisos se vuelven a verificar en el servicio,
no solo en la UI.

## 6. Verificación ejecutada

| Comando / comprobación | Resultado |
|---|---|
| `npm.cmd run typecheck` | Sin errores. |
| `npm.cmd test` | **200/200** pruebas en **30 archivos**. |
| `npm.cmd run test:e2e` | **4/4** pruebas reales sobre Electron por CDP; `consoleErrors: []`. |
| `npm.cmd run test:updater` | `electron-updater` detectó `0.3.1` desde un feed efímero (instalada `0.3.0`). |
| `npm.cmd audit` / `npm.cmd audit --omit=dev` | 0 vulnerabilidades en ambos modos. |
| `npm.cmd run dist:win` | NSIS x64, `app.asar`, `better-sqlite3` desempaquetado, icono y desinstalador. |
| Firma | `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1 `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin timestamp. |
| Arranque instalado | Electron `45.4.1`, BD creada, `integrity_check = ok`, versión `0.3.0`, sin errores propios de consola. |
| Módulos | 30 activos, 0 pendientes (`src/renderer/src/app/modules.ts`). |

Las pruebas de integración nuevas (`tests/integration/modulos2026.test.ts`) cubren la migración,
el ciclo de presupuestos, el cálculo de ITBIS de servicios, la depreciación de activos, la
conversión de CRM, los KPIs con ocultamiento de utilidad y el panel de salud sin permiso.

## 7. Artefacto de entrega

| Campo | Valor |
|---|---|
| Instalador | `EnterpriseProERP-Setup-0.3.0.exe` |
| Tamaño | 145.429.840 bytes |
| SHA-256 | `D508A61277EC5971A04A5AD0D9E970D07160F09CE4851A99E3FFBB18D3728C75` |
| SHA-512 (base64, `release/latest.yml`) | `x8TTXSTZTSQBibH7MjzVx5ArTeQjK9C3HZmGUhxZF72ARoClZWiNkjQOwEqc1jgJuaR7NVU/rg3JUaNMS/pdeg==` |
| Tipo | NSIS 3 Unicode, x64, per-usuario, carpeta configurable |
| Firma | Autofirmada, SHA-256, sin timestamp |

`release/latest.yml` se regeneró **después de firmar** para que el SHA-512 coincida con el
instalador publicado.

## 8. Limitaciones

- **SmartScreen permanece**: la firma es autofirmada; se requiere certificado de CA pública.
- **Feed de producción no definido**: `build.publish.url` sigue apuntando a
  `http://127.0.0.1:8080/` solo para pruebas. En producción debe sustituirse por HTTPS o
  definirse `ERP_UPDATE_URL`.
- **e-CF**: no hay emisión ni certificación DGII.
- Cual cambio futuro de esquema, dependencias mayores o flujos financieros requiere nueva
  migración versionada y autorización.
