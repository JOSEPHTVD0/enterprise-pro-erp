# Paneles y ajustes avanzados 2026

Este documento describe el paquete de mejoras locales que amplía el ERP con dos paneles
nuevos, un grupo de ajustes administrables y preferencias de estación que por fin se
aplican a los paneles existentes.

Estado: **publicado en `0.5.7`**. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.7 ·
[Novedades de la versión](21-novedades-0.5.7.md).

## Alcance

### Panel operativo 2026

- Vista `panel-2026`, protegida por `inteligencia.consultar`.
- Consulta `panel2026.resumen`, un canal IPC de solo lectura con filtro validado por Zod.
- Muestra KPIs reales (ventas, cobros, CxC/CxP, vencimiento, stock y utilidad condicionada
  a `reportes.ganancia`), tendencia mensual, proyección de efectivo, envejecimiento de CxC,
  principales clientes/productos, alertas y módulos 2026.
- La proyección, el umbral de vencimiento, el umbral de stock, el número de filas, la vista
  inicial y la métrica principal se leen de los ajustes de empresa `panel2026`. Si la
  llamada no especifica vista/métrica, se usan los valores administrativos como defaults.
- `compararPeriodo` agrega ventas y cobros del periodo anterior real, siempre en centavos,
  y la UI degrada a «no disponible en esta vista» si el backend no entrega la comparación.
- El nivel mínimo de alerta y los destinos se respetan desde el grupo `alertas`, tanto en
  inteligencia operativa como en el panel.
- Ningún total se calcula en el renderer: la UI solo formatea importes que ya vienen en
  centavos desde SQLite.

### Mapa de capacidades 2026

- Vista `capacidades-2026`, protegida por `dashboard.consultar`.
- Presenta el catálogo real de módulos: grupo, fase, disponibilidad, permiso mínimo,
  descripción y características declaradas.
- No usa datos de ejemplo ni llama a servicios externos; solo consulta metadata compartida
  y el catálogo de permisos.
- Permite filtrar por texto, grupo, fase, módulos activos y permisos del usuario, además de
  exportar el catálogo filtrado a CSV.

### Preferencias de panel efectivas

- Nuevo canal `panel.preferencias.get`, protegido por `dashboard.consultar`.
- Combina las preferencias de estación (`settings.panel`) con los ajustes de empresa
  (`widgets`, `rendimiento`) y los permisos del usuario.
- `verUtilidad`, `verCostos` y `verSalud` nunca pueden conceder información: se aplican
  solo como un filtro adicional después de verificar los permisos en backend.
- `seriesPorDefecto` alterna la tendencia del panel ejecutivo entre datos diarios (30 días)
  y mensuales (12 meses); `filasPanel` limita los tops y `intervaloActualizacionSeg` rige
  el refresco automático.

### Ajustes `panel2026`

Grupo administrativo nuevo, guardado en SQLite convalidación Zod, auditoría y transacción:

| Clave | Propósito |
|-------|-----------|
| `vista` | Vista inicial del panel operativo. |
| `metricaPrincipal` | KPI destacado al abrir el panel. |
| `diasProyeccion` | Horizonte de la proyección de efectivo (7-90 días). |
| `umbralCxcDias` | Días para clasificar el envejecimiento de CxC. |
| `umbralStockBajo` | Conteo de existencias consideradas críticas. |
| `filas` | Máximo de filas en tablas y tops. |
| `compararPeriodo` | Activa la comparación visible del período. |
| `mostrarAlertas` | Permite silenciar el panel de alertas. |

Ahora pertenece a `ajustesGruposVisuales`, junto con `alertas` y `notificaciones`, por lo
que se entrega automáticamente a los usuarios autenticados como preferencia de interfaz.
Sigue sin exponer grupos operativos (`seguridad`, `integraciones`, `rendimiento`,
`flujos`, `fiscal`). Su edición usa el permiso base `configuracion.ajustes.modificar` y
queda registrada en `auditoria`.

## Seguridad y límites

- No cambian `INACTIVITY_MINUTES = 30`, `ABSOLUTE_HOURS = 12` ni
  `MAX_FAILED_ATTEMPTS = 5`.
- `contextIsolation` sigue activo y `nodeIntegration` desactivado; el token continúa vivo
  solo en memoria del preload.
- `buildContext` y `requirePermission` siguen siendo la autoridad: los feature flags solo
  ocultan módulos opcionales y nunca sustituyen permisos.
- Los módulos protegidos (`dashboard`, `configuracion`, `seguridad`, `respaldos`) no pueden
  ocultarse. `capacidades-2026` usa el dominio protegido `dashboard`.
- Las consultas nuevas llevan `empresa_id`, usan SQL parametrizado y no permiten que el
  renderer envíe SQL, rutas ni lógica de negocio.
- No hay emisión ni certificación DGII: los libros 606/607 siguen siendo borradores
  locales.

## Archivos principales

- `src/shared/schemas/ajustes.ts`: grupo `panel2026`, defaults y esquema de guardado.
- `src/shared/schemas/paneles.ts`: filtros del panel y contrato de preferencias.
- `src/main/services/panel2026.service.ts`: consultas reales del panel operativo.
- `src/main/services/panel-preferencias.service.ts`: combinación segura de preferencias.
- `src/main/services/dashboard-ejecutivo.service.ts`: serie diaria, límites y umbrales.
- `src/main/ipc/router.ts`: canales `panel2026.resumen` y `panel.preferencias.get`.
- `src/renderer/src/features/panel2026/Panel2026Page.tsx`: panel operativo.
- `src/renderer/src/features/capacidades/Capacidades2026Page.tsx`: mapa de capacidades.
- `src/renderer/src/features/configuracion/CentroControlPage.tsx`: editor del grupo nuevo.
- `src/renderer/src/features/dashboard/DashboardEjecutivoPage.tsx`: preferencias aplicadas.

## Verificación

Verificación original de la release `0.5.7`:

- `npm run typecheck`: correcto.
- `npm test`: 41 archivos y 266 pruebas, todas superadas.
- `npm run test:e2e`: 21/21 pruebas superadas, incluidas las dos de los paneles nuevos y
  la comprobación final de errores de consola.
- `npm run test:updater`: correcto; el feed local anuncia `0.5.8` frente a una instalación
  `0.5.7`.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Las tres URLs públicas de la release responden HTTP 200 y el `latest.yml` publicado
  coincide con `release/latest.yml`.

Tras la release se verificó de nuevo el árbol de trabajo y se publicó como `0.5.8`:
`typecheck` correcto, `303/303` pruebas unitarias/integración, `24/24` E2E, updater
detectando `0.5.9` y `audit --omit=dev` sin vulnerabilidades. Detalle en
[22-correcciones-post-0.5.7.md](22-correcciones-post-0.5.7.md) y
[23-novedades-0.5.8.md](23-novedades-0.5.8.md).
