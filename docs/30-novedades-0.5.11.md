# Novedades de la versión 0.5.11

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.11

Incluye todo lo publicado en `0.5.10` y añade el módulo **Espacio de trabajo**,
construido sobre datos SQLite reales. Detalle funcional: [docs/29](29-espacio-trabajo-local.md).

## Cambios

- **Panel operativo**: ventas, compras, cobros, pagos, CxC, CxP, ticket promedio y
  utilidad condicionada a `reportes.ganancia`; tendencia temporal y detalle por vista
  (productos, proveedores, stock bajo y vencimientos).
- **Comprobantes**: listado real de documentos de venta y compra con búsqueda por
  número, NCF, entidad y RNC; exportación CSV generada en backend y emisión de PDF
  con `pdf.generar`, con historial central de reimpresiones.
- **Parámetros**: lectura mediante `config.get` y escritura auditada con
  `config.parametro.set`, exigiendo `configuracion.parametros.modificar`.
- **Herramientas**: `integrity_check`, `foreign_key_check`, estado de migraciones,
  catálogo de permisos, acceso por roles, métricas de la base y reindexación SQLite
  auditada, protegida por `espacio.mantenimiento` con confirmación explícita.
- **Personalización**: preferencias persistentes de estación, ajustes de empresa
  validados en backend y plantillas en SQLite que capturan tema, interfaz, widgets
  y panel 2026.
- **Migración `014_espacio_trabajo`**: crea `espacio_presets` y `espacio_emisiones`,
  índices y permisos nuevos de forma idempotente. No se editaron las migraciones
  `001`–`013`.
- **Permisos nuevos**: dominio `espacio` con consultar, crear, modificar, eliminar,
  imprimir, exportar y mantenimiento (crítico). Administrador recibe todos; Gerente
  queda excluido de `espacio.mantenimiento`.
- **Menú y paleta**: el módulo se registra en el catálogo real, por lo que aparece
  en el menú, la paleta global y las vistas personalizables sin enlaces inertes.

## Seguridad

No cambian `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, el
`isTrusted` de los canales IPC, las políticas de sesión (30 min / 12 h), la
verificación de permisos en servicio, las transacciones ni la auditoría. Cada canal
`espacio.*` valida sesión, política de cambio de clave, permiso backend y esquema Zod.
La emisión de PDF reutiliza los permisos de impresión de ventas o compras según el
origen del documento. No hay emisión ni certificación DGII.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.11.exe` — 145.535.128 bytes.
- SHA-256: `0EE0122F07F4E5C1879D85473FF5BC4E5D7D04A590AF407893D8739C3C937BDC`.
- SHA-512: `nJqk85/NuSnJqTjIdxMHAUvbJdbFwrS9K8qaEVje7bPYlThwMQhBoiijg+WAycmQtI/aLQH0r3RvfGp9/gUk/w==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.11/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.11/EnterpriseProERP-Setup-0.5.11.exe.blockmap

El instalador está firmado con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo.
`Get-AuthenticodeSignature` informa `Status: 1` por la raíz no confiable; es el caso
esperado y reconocido por el verificador propio del actualizador. SmartScreen no
desaparece sin una CA pública.

El árbol de trabajo completo se confirmó y envió a `main` antes de crear el tag, para
que el código fuente de esta versión quede versionado junto con los artefactos.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 47 archivos, 337 pruebas.
- `npm.cmd run test:e2e`: 26/26, incluida la navegación al espacio de trabajo.
- `npm.cmd run test:updater`: detectó `0.5.12` en un feed efímero desde la `0.5.11`
  instalada y guardó el instalador sin ejecutarlo.
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder y dos sesiones
  simultáneas.
- Las seis pruebas de integración nuevas están en
  `tests/integration/espacio-trabajo.test.ts`.
