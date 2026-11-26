# Espacio de trabajo — detalle funcional de v0.5.11

Esta ampliación se desarrolló inicialmente en local y se **publicó como v0.5.11** con
autorización explícita. Datos de entrega: [docs/30](30-novedades-0.5.11.md).

## Alcance

Se añade el módulo **Espacio de trabajo** (`espacio-trabajo`) con cinco áreas funcionales:

1. **Panel**: ventas, compras, cobros, pagos, CxC, CxP, ticket promedio, utilidad condicionada a `reportes.ganancia`, tendencia real y detalle por vista (productos, proveedores, stock bajo y vencimientos).
2. **Comprobantes**: listado real de documentos de venta y compra, búsqueda por número/NCF/entidad/RNC, exportación CSV y emisión de PDF con `pdf.generar`. Cada emisión se registra en un historial central.
3. **Parámetros**: lectura de `config.get` y escritura auditada mediante `config.parametro.set`, con control explícito por `configuracion.parametros.modificar`.
4. **Herramientas**: `integrity_check`, `foreign_key_check`, estado de migraciones, catálogo de permisos, acceso por roles, métricas de la base y reconstrucción auditada de índices SQLite.
5. **Personalización**: preferencias persistentes de estación, ajustes de empresa validados en backend y plantillas guardadas en SQLite que capturan tema, interfaz, widgets y panel 2026.

## Datos y reglas

- La migración `014_espacio_trabajo` crea `espacio_presets` y `espacio_emisiones` sin tocar las migraciones `001`–`013`.
- Todo importe se lee en centavos y se muestra con el formateador compartido.
- El panel solo consulta tablas reales: `documentos_venta`, `documentos_compra`, `cxc_recibos`, `cxp_pagos`, `cxc_documentos`, `cxp_documentos`, `existencias` y catálogos.
- La exportación CSV es generada por el backend y devuelta como base64; la UI no inventa datos.
- Los PDF se generan con el motor real `pdfmake` reutilizando los permisos de impresión del documento de origen. No hay emisión ni certificación DGII.
- La utilidad se muestra como «Sin permiso» cuando el perfil carece de `reportes.ganancia`.

## Permisos nuevos

Dominio `espacio`:

- `espacio.consultar`
- `espacio.crear`
- `espacio.modificar`
- `espacio.eliminar`
- `espacio.imprimir`
- `espacio.exportar`
- `espacio.mantenimiento` (crítico: reconstruye índices)

Administrador recibe todos; Gerente recibe todos excepto `espacio.mantenimiento`. El catálogo y la migración insertan los permisos de forma idempotente para bases nuevas y ya migradas.

## Canales IPC

- `espacio.resumen`
- `espacio.comprobantes`
- `espacio.comprobantes.exportar`
- `espacio.diagnostico`
- `espacio.reindex`
- `espacio.presets.list`
- `espacio.presets.save`
- `espacio.presets.delete`
- `espacio.emisiones.list`
- `espacio.comprobante.emitir`

Cada canal valida sesión, política de cambio de clave, permiso backend y esquema Zod antes de ejecutarse.

## Personalización

- La vista se registró en `vistasPersonalizables`, por lo que admite renombrado desde el centro de control.
- `dominioDeVista` asocia `espacio-trabajo` con el dominio `espacio` para cargar sus ajustes efectivos.
- El menú y la paleta global derivan del registro real de módulos; no hay enlaces inertes.

## Verificación

- Typecheck: correcto.
- Pruebas unitarias e integración: 47 archivos / 337 pruebas, incluidas seis pruebas nuevas del espacio de trabajo con base SQLite real.
- E2E: 26 escenarios sobre la aplicación compilada, incluida la navegación al espacio de trabajo.
- Updater e instancias: correctos con la versión `0.5.11`.
