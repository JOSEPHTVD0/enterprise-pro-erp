# 01 — Arquitectura Técnica · ENTERPRISE PRO ERP

> Fase 1 · Documento de decisiones. Sujeto a aprobación del propietario antes de iniciar la Fase 2.
>
> Nota: refleja el estado al cierre de la Fase 12. Las incorporaciones posteriores (pdfmake,
> Playwright, electron-updater y firma) están en
> [docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md).

## 1. Diagnóstico del entorno

- Carpeta de trabajo `C:\Users\ferre\Downloads\prueba`: **vacía**, sin proyecto previo.
- Node.js **v24.19.0**, npm **11.17.0** instalados.
- Windows (win32). PowerShell con política de scripts restringida → los scripts del proyecto
  se ejecutarán vía `npm.cmd` / `npx.cmd` (no afecta al usuario final).
- Sin dependencias de Internet en tiempo de ejecución: todo se empaqueta con la aplicación.

## 2. Vista general

Aplicación de escritorio Electron con tres procesos/capas:

```
┌────────────────────────────────────────────────────────────┐
│ RENDERER (React + TS + Tailwind)                           │
│  UI pura. Sin acceso a Node, sin acceso a BD.              │
│  contextIsolation: ON · nodeIntegration: OFF · sandbox: ON │
└───────────────▲────────────────────────────────────────────┘
                │ window.api (preload, canales tipados, invoke)
┌───────────────┴────────────────────────────────────────────┐
│ MAIN (Node.js) — "backend local"                           │
│  1. IPC Router: valida sesión + permiso + esquema Zod      │
│  2. Services: lógica de negocio (transacciones)            │
│  3. Repositories: SQL parametrizado (better-sqlite3)       │
│  4. Infra: auditoría, numeración, backups, impresión, PDF  │
└───────────────▲────────────────────────────────────────────┘
                │ SQL + transacciones (WAL)
┌───────────────┴────────────────────────────────────────────┐
│ SQLite — %APPDATA%/enterprise-pro-erp/data/enterprise.db   │
└────────────────────────────────────────────────────────────┘
```

### Por qué esta separación
- El renderer nunca ve la BD ni Node: superficie de ataque mínima.
- Toda regla de negocio (stock, costos, saldos, permisos) vive en **services** del main,
  reutilizable por IPC, reportes, POS y futuras API LAN.
- Los services son testeables con Vitest sobre SQLite en memoria, sin Electron.

## 3. Stack y decisiones técnicas

| Área | Elección | Justificación |
|---|---|---|
| Shell escritorio | Electron + **electron-vite** | Build rápido, HMR, empaquetado main/preload/renderer estándar. |
| UI | React 18 + TypeScript + Tailwind CSS | Requisitos del proyecto; componentes propios reutilizables. |
| Estado UI | Zustand (ligero) + React Query para datos IPC | Caché, invalidación y estados de carga consistentes. |
| **Acceso a BD** | **better-sqlite3** + migraciones SQL versionadas + repositorios tipados | ⚠️ Alternativa a Prisma (permitida por el brief). Prisma añade un motor binario pesado, es asíncrono y complica transacciones síncronas atómicas en Electron. better-sqlite3 es síncrono, rapidísimo, permite `db.transaction()` real y simplifica el costo promedio y el kardex. SQL 100 % parametrizado (anti-inyección). |
| Validación | Zod (esquemas compartidos `shared/schemas`) | Un solo esquema valida en renderer (formularios) y main (IPC). |
| Dinero | **Enteros en centavos** (`INTEGER`) en toda la BD | Evita errores de punto flotante en facturación e ITBIS. Formato RD$ solo en UI/impresión. |
| Cantidades | REAL con 4 decimales + unidad de medida | Soporta granel/peso; validado por Zod. |
| Contraseñas | `crypto.scrypt` (N=16384) + salt aleatorio | Nativo de Node, sin dependencias, resistente. |
| Sesiones | Token en memoria del main; renderer solo lo referencia | Expiración por inactividad configurable; bloqueo de usuario. |
| PDF | `window.print()` + CSS `@media print` | Implementado y probado; pdfmake sigue aprobado pero **no instalado**. Plantillas carta/media página/ticket 80 mm/58 mm, offline. |
| Excel/CSV | ExcelJS + export CSV propio | Importación de productos y export de reportes. |
| Gráficos | Recharts · Iconos: Lucide | Requisitos del proyecto. |
| Pruebas | Vitest (services/repos sobre SQLite real) + CDP de Electron para UI real | Las reglas financieras se prueban sin mocks de BD. Playwright sigue aprobado pero **no instalado**; no se añadió dependencia solo para e2e. |
| Instalador | electron-builder@26.18.0 → NSIS (Win 10/11 x64) | Instala en `%LOCALAPPDATA%\Programs`, datos en `%APPDATA%\enterprise-pro-erp`, desinstalación pregunta antes de borrarlos. Implementado en Fase 12. |

## 4. Estructura de carpetas propuesta

```
enterprise-pro-erp/
├─ package.json
├─ electron.vite.config.ts
├─ tailwind.config.ts
├─ docs/                          # esta documentación + ADRs
├─ src/
│  ├─ main/                       # proceso principal (backend local)
│  │  ├─ index.ts                 # ciclo de vida, ventana, single-instance lock
│  │  ├─ ipc/                     # router IPC: registro de canales por módulo
│  │  │  ├─ router.ts             # sesión → permiso → Zod → service
│  │  │  └─ channels/             # auth.ts, ventas.ts, inventario.ts, ...
│  │  ├─ db/
│  │  │  ├─ connection.ts         # WAL, foreign_keys, busy_timeout
│  │  │  ├─ migrations/           # 001_init.sql, 002_..., runner con versión
│  │  │  └─ seed.ts               # solo datos estructurales (roles, admin, parámetros)
│  │  ├─ repositories/            # SQL por entidad (una carpeta por módulo)
│  │  ├─ services/                # lógica de negocio transaccional
│  │  │  ├─ auth/  config/  clientes/  productos/  inventario/
│  │  │  ├─ ventas/  pos/  compras/  cxc/  cxp/  bancos/  caja/
│  │  │  ├─ gastos/  comisiones/  reportes/  auditoria/  backups/
│  │  │  └─ core/                 # dinero, costos, numeración, impuestos, NCF
│  │  └─ infra/                   # impresión, PDF, Excel, scheduler de backups
│  ├─ preload/
│  │  └─ index.ts                 # contextBridge: API tipada mínima
│  ├─ shared/                     # código común main+renderer (sin Node)
│  │  ├─ schemas/                 # Zod por módulo
│  │  ├─ types/                   # tipos de dominio e IPC
│  │  └─ permissions.ts           # catálogo de permisos (módulo.operación)
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ app/                  # router, layout, providers, tema
│        ├─ components/ui/        # Button, Modal, DataTable, Input, Toast, ...
│        ├─ features/             # un folder por módulo (pantallas + hooks)
│        │  ├─ dashboard/ auth/ config/ usuarios/ clientes/ proveedores/
│        │  ├─ productos/ inventario/ ventas/ pos/ cotizaciones/ compras/
│        │  ├─ cxc/ cxp/ bancos/ caja/ gastos/ vendedores/ reportes/
│        │  └─ auditoria/ backups/
│        ├─ lib/                  # api client, formato RD$, fechas, atajos
│        └─ styles/
├─ tests/
│  ├─ unit/                     # services y core (dinero, costos, ITBIS)
│  └─ integration/              # SQLite real, router IPC, impresión, rendimiento y persistencia
├─ build/                        # icono .ico e include NSIS
└─ dist/                         # instalador NSIS y win-unpacked (ignorado por git)
```

Reglas: ningún archivo > ~400 líneas sin justificación; lógica de negocio **solo** en
`main/services`; los componentes de UI nunca calculan saldos ni costos "por su cuenta".

## 5. Seguridad

1. **Electron**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
   CSP estricta, navegación externa bloqueada, un solo `preload` con API mínima.
2. **IPC**: cada canal declara `{ permiso, esquemaZod, handler }`. El router:
   valida sesión activa → verifica permiso del usuario → valida payload → ejecuta service.
   Ningún canal acepta SQL ni rutas arbitrarias.
   *Implementado en Fase 3:* el token de sesión se conserva únicamente en memoria del
   `preload` (nunca en `localStorage`, disco ni BD); la BD guarda solo `sha256(token)`.
   Al reiniciar la aplicación se cierran las sesiones abiertas. Un `UNAUTHORIZED`
   notifica al renderer para volver a la pantalla de login.
3. **Permisos granulares**: catálogo `modulo.recurso.operacion`
   (consultar/crear/modificar/eliminar/anular/aprobar/imprimir/exportar/descuentos/
   precios/costos/ganancias/devoluciones/abrir_caja/cerrar_caja). Roles los agrupan;
   overrides por usuario. Doble verificación: UI oculta + backend rechaza.
4. **Auditoría**: tabla `auditoria` escrita dentro de la misma transacción de cada
   operación crítica (usuario, fecha, operación, entidad, id, valores antes/después).
5. **Documentos contabilizados**: inmutables. Corrección = anulación/reversión que
   genera movimientos contrarios (inventario, CxC/CxP, caja) enlazados al original.
6. **Concurrencia**: WAL + `busy_timeout` + transacciones inmediatas; lock de
   instancia única; numeración de documentos con `UPDATE ... RETURNING` atómico.
7. **Recuperación**: WAL + checkpoints; backup automático programado; verificación
   `PRAGMA integrity_check` en cada respaldo.

## 6. Funcionamiento sin Internet y datos locales

- Cero llamadas de red en runtime. Fuentes, iconos y assets empaquetados localmente.
- BD: `%APPDATA%/enterprise-pro-erp/data/enterprise.db` (fuera del directorio de instalación,
  sobrevive a actualizaciones y desinstalación).
- Respaldos: carpeta configurable (por defecto `%APPDATA%/enterprise-pro-erp/backups`),
  copia consistente vía API de backup de SQLite, historial + integridad verificada.
- Restauración: solo administrador, con doble confirmación, respaldo previo automático
  de la BD actual y reinicio controlado de la aplicación.
- Impresión: `webContents.print` / `printToPDF` del propio Electron (impresoras locales,
  tickets 58/80 mm). Gaveta de efectivo: comando ESC/POS opcional si el hardware lo soporta.
- **Multi-empresa**: todas las tablas operativas llevan `empresa_id`; la sesión fija la
  empresa activa y los repositorios filtran siempre por ella. Aislamiento total de datos.
- **Futuro LAN**: los services ya son el "servidor". Una versión futura podrá exponerlos
  por HTTP local con el mismo router de permisos, sin reescribir la lógica.

## 7. Adaptación República Dominicana

- Moneda base DOP, formato `RD$ 1,234.56` (separadores configurables), monedas adicionales
  con tasas de cambio por empresa.
- ITBIS configurable (18 % estándar; exento/16 % histórico), cálculo por línea y por
  documento con redondeo bancario a 2 decimales, centralizado en `services/core/impuestos`.
- NCF: series por tipo de comprobante (B01 crédito fiscal, B02 consumo, B04 notas de
  crédito, etc.), rangos con vigencia y alerta de agotamiento. Secuencias internas
  independientes de la numeración fiscal.
- RNC/cédula con validación de formato (longitud y dígitos; verificación DV configurable).
- Libro de ventas y libro de compras como reportes exportables (formato DGII 606/607
  como objetivo de la fase de reportes).
- **e-CF**: se deja el modelo preparado (campos de comprobante, XML futuro, certificado),
  pero el sistema se presenta como "comprobantes con NCF" — **no certificado DGII**.
