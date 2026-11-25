# Centro de control administrativo 0.5.0

Estado: **implementado y verificado en el árbol de trabajo**; pendiente de publicación/release.
Versión del paquete: **0.5.0**.

## Objetivo

Ampliar ENTERPRISE PRO ERP con un centro de control administrativo donde se puedan
configurar desde un solo lugar los ajustes operativos, la apariencia, los paneles,
los flujos, las notificaciones, las integraciones locales, los módulos y los permisos
por rol, con descripción visible de qué habilita cada permiso.

## Principios

- Todo lo operativo configurable se guarda en SQLite por empresa, con permiso y auditoría.
- Las preferencias de estación siguen en `settings.json` mediante `settings:get/set`.
- Ningún ajuste puede desactivar Context Isolation, Node Integration, IPC confiable,
  auditoría obligatoria, transacciones ni integridad referencial.
- Los cambios de permisos se validan, auditan y aplican a sesiones nuevas de inmediato.
- Los cálculos avanzados son locales: no se introduce Internet, IA externa ni telemetría.
- Cada panel nuevo consulta datos reales de SQLite; no hay tarjetas decorativas.

## Implementado

### 1. Permisos con descripción y editor auditable

- `PermissionDef` incorpora `descripcion` y `critico`; el catálogo cubre los permisos
  nuevos de ajustes e inteligencia operativa.
- `RolesPage` y el centro de control muestran para qué sirve cada permiso.
- Canales explícitos:
  - `seguridad.permissions.catalog`
  - `seguridad.roles.permissions.get`
  - `seguridad.roles.permissions.replace`
- El reemplazo de permisos valida claves Zod, exige confirmación para permisos
  críticos, impide editar el rol Administrador, evita quedar sin roles de gestión y
  audita el diff (`agregados`, `removidos`, `motivo`).
- `RolesPage` incluye buscador por nombre, clave y descripción.

### 2. Permisos personalizados (migración `010`)

- Espacio reservado `custom.*`: el administrador crea, edita y elimina permisos con
  etiqueta, módulo, descripción de uso y marca de criticidad.
- El catálogo entregado al frontend combina el catálogo fijo con los permisos de la
  empresa activa; las claves se validan contra lo realmente existente en SQLite.
- Creación/edición/eliminación se auditan en `auditoria` (`CREAR`, `MODIFICAR`,
  `ELIMINAR` sobre `permisos`). Al crear, se conceden automáticamente al rol
  Administrador de esa empresa.
- Un permiso personalizado **no habilita rutas del sistema por sí solo**: `buildContext`
  y `requirePermission` siguen aplicando solo permisos fijos. Es una etiqueta
  gobernada, asignable y auditable para necesidades documentales/operativas.

### 3. Ajustes por empresa (migración `009`)

Tabla `ajustes` con clave `(empresa_id, grupo)`, `datos_json`, auditoría de usuario
y fecha. Los defaults se derivan de Zod; la BD solo guarda excepciones.

Grupos implementados:

| Grupo | Contenido |
|---|---|
| `alertas` | Umbrales de stock, series, CxC vencida y presupuesto; nivel y destinos |
| `flujos` | Aprobaciones, motivo de anulación, autoaprobación, estados de orden y cierre de caja |
| `widgets` | Visibilidad, orden, ancho, densidad, intervalo, filas, tamaño de página, buscador global, filtros/columnas/CSV y confirmación de borrado |
| `rendimiento` | Límite de filas, caché, VACUUM, bajo consumo y carga diferida |
| `integraciones` | Carpeta relativa de exportación, formatos e impresora de tickets |
| `tema` | Escala, radios, fuente, color de acento, contraste y movimiento |
| `fiscal` | ITBIS, moneda base, redondeo bancario fijo, aviso NCF y libros 606/607 |
| `notificaciones` | Sonido, duración y eventos |
| `seguridad` | Ocultar costos, confirmar anulaciones, enmascarar RNC y aviso de bloqueo |
| `featureFlags` | Módulos opcionales activos; los módulos protegidos no se pueden ocultar |

Canales: `config.ajustes.get`, `config.ajustes.save`, `config.ajustes.reset`.
Los grupos `seguridad`, `integraciones` y `featureFlags` requieren un permiso extra.

### 4. Paneles configurables y tema

- El panel ejecutivo respeta visibilidad, orden, densidad e intervalo de actualización.
- Los feature flags se aplican en `Sidebar` y en el enrutado de `App`.
- El tema avanzado se aplica mediante variables CSS validadas; no se acepta CSS libre.
- Las preferencias nunca sustituyen a la autorización del backend.

### 5. Inteligencia operativa

Nueva vista con permiso `inteligencia.consultar` y canal `inteligencia.resumen`.
Todas las cifras salen de SQLite de la empresa activa:

- Tendencia mensual de ventas y compras.
- Envejecimiento de CxC y CxP con vencimiento real.
- Rotación y valorización de inventario desde el kardex.
- Rentabilidad por producto; costos y utilidad solo con permisos finos.
- Flujo proyectado a 28 días desde vencimientos pendientes.
- Actividad de auditoría de los últimos 7 días.
- Radar de CRM, servicios y activos según permisos por subwidget.
- Diagnóstico y señales tempranas con umbrales administrables.

No se afirma emisión de e-CF ni certificación DGII.

### 6. Escritura continua y manejo de tablas

- `NumberInput` conserva el borrador exacto mientras se escribe (`1.`, `1e`, `-`,
  `1,25`) y convierte/sanea solo al salir o pulsar Enter; Escape restaura el valor.
- `TextInput` usa `type="text" inputMode="decimal"` cuando antes recibía
  `type="number"`, de modo que el navegador ya no descarta entradas intermedias.
- Aplicado a ajustes, catálogos, formatos, impresión, respaldos, compras, ventas,
  finanzas, inventario y módulos 2026. `parseNumericDraft` tiene pruebas unitarias.
- `DataTable` ahora busca en todas las columnas (incluidas las que solo tenían
  `render`), añade filtros por columna, selector de columnas, exportación CSV,
  ordenación, paginación configurable desde ajustes y contador de registros.
- `Sidebar` incorpora buscador global de módulos que respeta permisos y feature
  flags y limpia la consulta al navegar.

### 7. Seguridad conservada

- No se modificó el bucle genérico del router ni el preload; todas las rutas nuevas
  son explícitas.
- `buildContext` y `requirePermission` siguen siendo la autoridad en backend.
- Políticas duras intactas: inactividad de 30 min, sesión absoluta de 12 h,
  máximo 5 intentos, WAL, FK, transacciones y auditoría.
- Las migraciones aplicadas no se editaron; se añadieron `009_centro_control.ts`
  y `010_permisos_personalizados.ts`.

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 234/234 pruebas en 37 archivos.
- `npx playwright test`: 8/8 E2E (incluye buscador global y creación de permisos).
- `npm run test:updater`: correcto (detecta 0.5.1 desde el feed local de prueba).
- `npm audit` y `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm run build`: correcto.

## Pendiente para publicar

1. Generar y firmar el instalador `EnterpriseProERP-Setup-0.5.0.exe`.
2. Regenerar el feed con `latest.yml` coherente con 0.5.0.
3. Crear tag `v0.5.0` y release con instalador + `latest.yml`.
4. Corregir el feed histórico que hoy anuncia `0.4.1`, que no existe como release.
