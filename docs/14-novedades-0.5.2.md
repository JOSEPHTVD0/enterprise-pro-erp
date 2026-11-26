# Novedades de la iteración 0.5.2

Esta iteración amplía el centro de control, separa realmente **Ventas** de
**Cobros** y conecta varias funciones avanzadas que ya tenían backend pero no
tenían interfaz. No cambia las políticas duras de seguridad (sesión de 30 min,
12 h absolutas, 5 intentos fallidos, IPC cerrado, transacciones, WAL, claves
foráneas y auditoría).

## 1. Cobros como área independiente

- Nuevo módulo **Cobros** con permisos propios:
  `cobros.consultar`, `cobros.crear`, `cobros.anular`, `cobros.imprimir`, `cobros.exportar`.
- Facturación y POS **ya no piden pagos ni registran cobros**: documentan la venta
  y generan un cargo CxC pendiente.
- Los recibos, anticipos, anulaciones, impresión y exportación se hacen en Cobros.
- La fachada `cobros.service` es la autoridad del área; CxC sigue siendo el
  almacén, pero un rol solo necesita `cobros.*`.
- Perfil **Vendedor** sin `cobros.*`. Plantillas nuevas: Solo Ventas, Solo Cobros,
  Solo Consulta y Personalización.
- Corregido el mojibake de las cadenas de la pantalla de Cobros.

## 2. Personalización total desde Ajustes

- Nueva pestaña **Interfaz**: título de la aplicación, ancho del menú, densidad
  de tablas, iconos, orden de grupos, renombrado de módulos, elementos ocultables
  y pie personalizado.
- Nueva pestaña **Por rol / permiso**: capas visuales `(empresa, ámbito, objetivo, grupo)`
  con prioridad empresa → rol → permiso. Solo se fusionan las claves escritas,
  por lo que una capa parcial no borra valores de otra capa.
- Grupos exponibles: `tema`, `widgets`, `featureFlags` e `interfaz`. Los grupos
  operativos y de seguridad nunca se devuelven en la interfaz efectiva.
- `config.ajustes.efectivos` entrega la interfaz resultante sin permiso extra;
  las capas se validan con Zod y toda escritura queda auditada.
- Los módulos protegidos (`dashboard`, `configuración`, `seguridad`, `respaldos`)
  no se pueden ocultar con *feature flags*.
- Formatos de impresión unificados en todo el ERP: `CARTA`, `MEDIA`,
  `TICKET_80`, `TICKET_58`. Los valores históricos (`TICKET80`, `TICKET58`, etc.)
  se normalizan al leer; ya no hay casts ocultos en `lib/pdf.ts`.

## 3. Roles y permisos

- Creación, edición y **borrado** de roles personalizados (`seguridad.rol.eliminar`),
  con protección de los roles del sistema y comprobación de usuarios asignados.
- Plantillas de roles cargables desde el editor de roles.
- Catálogo con descripción visible de **para qué sirve cada permiso** en Roles y
  en el Centro de control.
- Permisos personalizados `custom.*` con descripción y auditoría. Siguen siendo
  etiquetas: **no habilitan rutas** porque `requirePermission()` compara claves literales.
  La clave es única a nivel global, así que no pueden duplicarse entre empresas.
- Alta de departamentos desde Usuarios (con `seguridad.crear`), con lista y
  auditoría por empresa.

## 4. Escritura continua, búsqueda y funciones avanzadas

- Los campos de texto y número admiten escritura seguida, sin pausa ni bloqueo
  por carácter (corrección aplicada en 0.5.1 y conservada aquí).
- Buscadores activos en Roles, Centro de control, DataTable y menú de módulos;
  filtros por nombre, clave y descripción de permisos.
- **Paleta global `Ctrl+K`**: busca módulos y registros de clientes, productos,
  proveedores y vendedores. Solo ofrece destinos permitidos por el permiso del
  usuario y respeta los *feature flags*; el backend vuelve a verificar cada ruta.
- **Inspector de costos** en Existencias: historial de costos y últimos movimientos
  del kardex, solo para roles con `inventario.costo`.
- **Detalle universal** de presupuestos, órdenes de servicio y activos fijos
  desde el módulo 2026, usando los canales de solo lectura ya existentes.
- **Series consecutivas deterministas**: si hay varias series activas para un
  tipo de documento, se usa siempre la primera creada (`ORDER BY activa DESC, id ASC`).
  La pantalla de series muestra el próximo número exacto que se reservará.
- **Centro de tareas** en el Inicio: reúne stock agotado, CxC pendiente y
  comprobaciones de salud con un enlace directo al módulo correspondiente. Solo
  muestra datos reales; no genera recordatorios inventados.
- **Cambio rápido de empresa** desde el menú del usuario: valida los roles del
  usuario, cierra la sesión anterior, emite un token nuevo y audita ambos eventos.
- **Monitor de sesión**: la barra de estado muestra el tiempo restante estimado
  (30 min de inactividad / 12 h absolutos) y avisa cuando quedan menos de 5 min.
- **Historial por registro**: Auditoría puede filtrar por ID de registro y buscar
  texto dentro de los valores antes/después.
- **Cierre forzado de sesiones** ajenas por un administrador, auditado y sin
  permitir cerrar la propia sesión desde ese panel.
- **Agenda de vencimientos**: CxC y CxP ordenados por fecha real, con días
  restantes, umbral configurable, búsqueda continua y accesos a Cobros/CxP
  condicionados a sus permisos.
- **Panel de control de stock**: existencias filtrables por almacén, mínimo y
  texto; valorización solo con `inventario.costo`; pestañas de movimientos,
  transferencias y ajustes; alta y exportación con permisos propios.
- **Plantillas rápidas de interfaz** en el centro de control: Clásico, Compacto,
  Alta visibilidad y Presentación. Aplican tema, paneles y menú por grupos
  auditados, sin tocar permisos ni políticas duras ni sobrescribir el orden y
  las etiquetas personalizadas del menú.

## 5. Aislamiento y seguridad reforzada

- El token de sesión viaja **una sola vez** al preload: `auth.login` filtra el
  contexto con `contextoPublico()` y `auth.me` ya no devuelve el token.
- Configuración de respaldos global con empresa propietaria canónico; historial,
  verificación y restauración filtrados por `empresa_id`.
- El panel de salud filtra por empresa la auditoría de 24 h, los respaldos y el
  último respaldo.
- Usuarios, roles, reset de contraseña y catálogos financieros aislados por
  `empresa_id`; las etiquetas `custom.*` se muestran como informativas.

## Migraciones

- `011_cobros_personalizacion.ts`: tabla `ajustes_personalizados`, nuevos permisos,
  asignación a Administrador/Gerente y match de `cobros.*`.
- `012_seguridad_respaldos.ts`: `empresa_id` en `backups_historial` e índices de
  auditoría. No se reescriben migraciones ya aplicadas.

## Verificación y publicación

- `npm run typecheck`: correcto.
- `npm test`: 38 archivos, 244 pruebas.
- `npm run test:e2e`: 16 pruebas.
- `npm run build`: correcto.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm run dist:win`: `EnterpriseProERP-Setup-0.5.2.exe` (145,482,376 bytes).
- Firma Authenticode con certificado autofirmado
  `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
  `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin timestamp público.
- `npm run release:feed`: `release/latest.yml` generado desde el instalador
  firmado; SHA-512 y tamaño verificados contra el archivo publicado.
- `npm run test:updater`: detectó `0.5.3` desde un feed local de prueba.

Release: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.2

Instalador: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.2/EnterpriseProERP-Setup-0.5.2.exe

Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.2/latest.yml

SHA-256 del instalador: `853458860FAE6B0675A30799742A7E2C7FE1F47100101D5BB6CCE82C32E05466`.
