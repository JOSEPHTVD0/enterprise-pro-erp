# Correcciones posteriores a 0.5.7 (publicadas en 0.5.8 y 0.5.9)

Estado: **publicado en `0.5.8`**. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.8 ·
[Novedades de la versión](23-novedades-0.5.8.md).

Este documento describe los cambios que originalmente quedaron en el árbol de trabajo tras
`0.5.7`: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.7

## 1. Pantalla negra al introducir la clave

Causa sistémica: un error de render dejaba el árbol de React vacío sobre el fondo oscuro
de la ventana (`backgroundColor: '#0b1220'`). No existía un límite de error y un perfil
heredado con grupos de ajustes parciales podía romper el shell, especialmente `Sidebar`.

Correcciones:

- `src/renderer/src/components/ui/ErrorBoundary.tsx`: límite de error global y una variante
  `compact` por vista. Nunca deja `#root` vacío; ofrece «Recargar interfaz».
- `src/renderer/src/main.tsx` y `src/renderer/src/app/App.tsx`: `<App />` y cada vista
  quedan envueltos.
- `src/renderer/src/app/ajustes-store.ts`: `normalizarAjustesEfectivos()` fusiona cada
  grupo con sus defaults y valida el grupo completo; un grupo corrupto se descarta sin
  tumbar los demás.
- `src/renderer/src/app/Sidebar.tsx`: defensas adicionales para `ocultarElementos`,
  `ordenGrupos` y `etiquetasModulo`.
- `src/renderer/src/lib/tema-avanzado.ts`: `normalizarTemaAvanzado()` acota `escala`,
  valida enums y evita escribir `"undefined"` en variables CSS.
- `src/renderer/src/app/session.ts`: `activeView` vuelve a `dashboard` en login, cambio de
  empresa, logout y expiración.
- `src/renderer/src/app/App.tsx`: los ajustes se recargan cuando termina
  `mustChangePassword`; mientras tanto el backend solo permite `auth.me`, `auth.logout` y
  `auth.changePassword`.

Regresiones añadidas:

- `tests/unit/black-screen-recuperacion.test.ts`: perfiles parciales y tema inválido.
- `tests/integration/centro-control.test.ts`: fila heredada `interfaz` con un solo campo,
  completada por el backend y sin exponer grupos operativos.
- `tests/e2e/app.spec.ts`: `#root` no vacío tras autenticar y navegar, y login tras sembrar
  una fila parcial en SQLite.

> Mitigaciones adicionales publicadas en `0.5.9`: el `ErrorBoundary` recarga mediante
> IPC, el renderer tiene recuperación automática en el proceso principal, la rama de
> cambio obligatorio deja un fondo visible y se pueden abrir varias instancias. Vea
> [docs/25](25-instancias-y-pantalla-negra.md) y [docs/26](26-novedades-0.5.9.md).

## 2. Ajustes administrativos con efecto real

### Backend

- **Flujos** (`ventas`, `compras`, `finanzas`, `modulos2026`): aprobación en el alta con
  `ventas.aprobar` / `compras.aprobar` salvo umbral en centavos
  (`autoAprobarHastaCent`); motivo de anulación configurable; estados de orden
  configurables (más `ANULADA`/`ENTREGADA` legacy); nuevo canal de solo lectura
  `cajas.cierreAutomatico`. La aprobación se audita como `AUTORIZAR_FLUJO` y ocurre dentro
  de la transacción, sin alterar estado, stock, CxC ni CxP.
- **Panel 2026**: `vista` y `metricaPrincipal` son defaults del filtro; `compararPeriodo`
  entrega importes reales del periodo anterior en centavos.
- **Alertas**: `stockBajoUmbral`, `cxcDiasVencimiento`, `seriesRestantes`, `destinos` y
  `nivelMinimo` gobiernan las señales de inteligencia y del panel.
- **Actualizaciones**: `settings.actualizaciones` controla búsqueda al iniciar, descarga
  automática, notificaciones y canal `ESTABLE`/`BETA`, sin cambiar feed ni `latest.yml`.
- **Respaldos**: `recordatorioDias`, `incluirPreferencias`, `compresión` y
  `verificarAlCrear` afectan al artefacto; `rendimiento.vacuumProgramado` ejecuta VACUUM
  fuera de transacción con WAL/FK activos.
- **PDF/exportación**: `incluirLogo`, `incluirPie`, `copias`, `margenMm`, `formatos`,
  `carpetaExportacion` y `exportacionAutomatica` se aplican en el proceso principal,
  con permiso `reportes.exportar` y carpeta siempre relativa bajo `userData`.
- **Fiscal**: `itbisPorDefecto`, `monedaBase`, `ncfAvisoDias`, `libro606` y `libro607`
  se sincronizan con parámetros, empresas, series y generación de libros. Sigue sin haber
  e-CF/DGII; `PREPARACION_E_CF` permanece inerte y `redondeo=BANCARIO` es fijo.

### Renderer

- `settings.interfaz` y `ajustes.interfaz` se unifican en `src/renderer/src/lib/format.ts`:
  densidad, tamaño de fuente, acento, animaciones, tooltips, confirmaciones y tamaño de
  página, sin clases duplicadas ni CSS libre.
- `widgets`: visibilidad, orden y ancho de tarjetas; columnas, filtros, CSV, borrado y
  paginación de tablas.
- `alertas`, `notificaciones` y `panel2026`: umbrales visibles, avisos con dedupe por
  firma, duración/sonido configurable y comparación del periodo anterior.
- `flujos.estadosOrden` genera los botones reales de órdenes de servicio;
  `flujos.cierreCajaAutomatico` omite la confirmación manual vía `cajas.cierreAutomatico`.
- `seguridad.ocultarCostosEnListados`, `mascararRnc` y `avisoAntesDeBloqueoMin` son capa
  visual. No sustituyen `requirePermission`, `inventario.costo` ni `reportes.costo`;
  `INACTIVITY_MINUTES = 30` y `ABSOLUTE_HOURS = 12` siguen fijos en backend y texto.

`config.ajustes.efectivos` entrega `tema`, `widgets`, `featureFlags`, `interfaz`, `alertas`,
`notificaciones` y `panel2026`. `seguridad`, `integraciones`, `rendimiento`, `flujos` y
`fiscal` no se exponen al renderer: se aplican en el proceso principal o como derivados
seguros.

## 3. Límites conservados

- `contextIsolation: true`, `nodeIntegration: false`, token solo en memoria del preload.
- `INACTIVITY_MINUTES = 30`, `ABSOLUTE_HOURS = 12`, `MAX_FAILED_ATTEMPTS = 5`.
- `buildContext`/`requirePermission` siguen siendo autoridad; los feature flags solo
  ocultan módulos opcionales y nunca conceden permisos.
- Módulos protegidos: `dashboard`, `configuracion`, `seguridad`, `respaldos`.
- Importes en centavos, WAL/FK/transacciones y auditoría en las escrituras.
- Libros 606/607 solo borradores locales; sin e-CF/DGII.
- Feed público sin cambios: `URL_FEED_PUBLICADO` en `src/shared/actualizaciones.ts`, con
  `ERP_UPDATE_URL` como sustitución opcional.

## 4. Claves que siguen sin consumidor directo

Se documenta para no prometer más de lo que hace:

- `impresion.impresora` e `integraciones.impresoraTicket`: el renderer usa
  `window.print()` y el IPC de PDF no acepta impresora; el backend resuelve la impresora.
- `impresion.copias`: no hay campo de copias en el IPC ni API de impresión desde renderer;
  solo se refleja como dato en el área de impresión.
- `impresion.impresionAutomatica`: evita la confirmación manual donde existe; no dispara
  impresión desatendida del sistema operativo desde el renderer.
- `impresion.incluirLogo` / `incluirPie`: se aplican al `.print-area`; el servicio PDF del
  backend conserva su propio logo/pie.
- `alertas.presupuestoPct`: no hay fuente real de porcentaje de presupuesto en las vistas
  modificables; la interfaz lo indica como no disponible.
- `seguridad.confirmarAnulaciones`: las anulaciones ya muestran confirmación de forma
  conservadora; no se creó una confirmación paralela que pudiera relajar el flujo actual.
- `rendimiento.lazyCargaModulos`: `App.tsx` importa estáticamente todas las páginas; activar
  esta clave exigiría reestructurar el shell y no se hizo sin autorización.
- Exportadores directos en archivos fuera del alcance de esta corrección siguen visibles
  aunque `integraciones.formatos` filtre las tablas y paneles modificados.

## 5. Verificación

Ejecutada con `package.json` todavía en `0.5.7`:

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test`: 42 archivos, 303 pruebas, todas superadas.
- `npm.cmd run test:e2e 2>nul`: 24/24 pruebas en Electron por CDP, incluido el perfil
  sucio y la ausencia de errores de consola.
- `npm.cmd run test:updater`: detecta `0.5.8` desde el feed local frente a una instalación
  `0.5.7`.
- `npm.cmd audit --omit=dev`: 0 vulnerabilidades.

Tras la autorización explícita se generó el instalador `0.5.8`, se firmó, se publicó el
feed y se creó la release. El detalle final está en
[23-novedades-0.5.8.md](23-novedades-0.5.8.md).
