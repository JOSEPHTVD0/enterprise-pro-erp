# Novedades de la versión 0.5.14

Publicada el 27 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.14

Incluye todo lo publicado en `0.5.13` y añade la modernización de **Ventas y
Facturación**, **Cobros**, la **búsqueda filtrada** y un **panel comercial
unificado**. El enlace DGI queda reducido a configuración visual: se guardan
parámetros de rotulado y se muestra un estado, sin envío, exportación ni
simulación de emisión e-CF.

## Cambios

### Búsqueda filtrada

- Nuevo componente compartido `FiltrosComerciales` con cliente, número, estado,
  tipo, rango de fechas, monto mínimo/máximo y producto.
- Los esquemas `documentosFiltroSchema` (ventas) y `finanzasFiltroSchema`
  (CxC, recibos, anticipos) aceptan los nuevos criterios con validación Zod.
- `ventas.repo.ts` y `finanzas.repo.ts` aplican los filtros directamente en SQL:
  número con `LIKE`, cliente/entidad, estado, fechas, importes en centavos y
  producto mediante `EXISTS` sobre las líneas reales de `documento_venta_lineas`.
- `DataTable` conserva búsqueda multi-término, facetas, reglas, vistas guardadas,
  orden, columnas configurables, paginación y CSV; ahora recibe `storageKey`
  estable en Facturación, Cobros y el panel comercial.

### Ventas y Facturación

- `FacturacionPage` usa el mismo componente de filtros y separa la vista en
  pestañas de documentos y borradores.
- Borradores guardados en `localStorage` (`erp-borradores-facturacion-v1`): son
  datos locales de trabajo, **no documentos en la base de datos** y **no reservan
  NCF**. Se pueden editar, emitir y borrar.
- Al emitir un borrador se llama al handler real `ventas.factura.crear`; el
  borrador local se elimina solo después de una emisión correcta.
- Los comprobantes emitidos siguen siendo inmutables: no existe el estado
  `BORRADOR` en `documentos_venta` y la edición solo afecta a borradores locales.
- `FacturacionEcfPanel` mantiene su rediseño publicado en `0.5.13`, F7 y
  `Salvar F7`, y añade el aviso DGI visual y el botón `Guardar borrador`.

### Cobros

- `CobrosPage` normaliza los anticipos (`entidadId`/`entidadNombre` →
  `clienteId`/`clienteNombre`) y conserva `cxc_documentos.saldo_cent` como única
  fuente de saldo; la interfaz no recalcula importes.
- Pestañas con estado coherente para facturas, recibos y anticipos, más los
  filtros avanzados compartidos.
- El botón `Exportar cartera` continúa usando `cobros.exportar` sobre la cartera
  CxC real; no se agregó exportación de recibos ni anticipos.

### Panel comercial unificado

- Nuevo módulo `panel-comercial` con permiso `reportes.consultar`.
- Consulta solo canales reales: `reportes.indicadores`, `reportes.serie`,
  `ventas.documentos`, `ventas.catalogos`, `cobros.documentos`, `cobros.recibos`,
  `cobros.anticipos` y `finanzas.catalogos` según permisos.
- Tarjetas de ventas del día/mes, facturado filtrado, CxC pendiente, cobrado,
  anticipos disponibles, documentos vencidos y ticket promedio.
- Gráfica de ventas/cobros, concentración por cliente y detalle unificado con
  pestañas de resumen, documentos y cobros/anticipos.

### Enlace DGI solo visual

- Nuevo grupo de ajustes `dgiEnlace` con `mostrarPanel`, `estadoVisual`,
  `ambienteVisual` y `notaInformativa`.
- Migración `015_dgi_enlace_visual.ts` para ampliar el `CHECK` de grupos en bases
  existentes, conservando los ajustes previos.
- Editor `Enlace DGI` en Centro de control y aviso en Facturación ECF.
- No hay credenciales, certificados, endpoints, canales IPC de emisión, envío a
  DGII ni exportación/simulación de e-CF.

## Seguridad e integridad

- Sin cambios en `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, validación `isTrusted` de IPC, permisos verificados en
  servicio, esquemas Zod, transacciones ni auditoría.
- La persistencia del enlace DGI pasa por `config.ajustes.save` y queda auditada.
- Los borradores son locales y no alteran la integridad de comprobantes emitidos.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: 50 archivos, 348 pruebas.
- `npm.cmd run test:e2e`: 29/29, sin errores de consola inesperados.
- `npm.cmd run test:updater`: detectó `0.5.14` desde la `0.5.13` instalada y
  guardó el instalador sin ejecutarlo.
- `npm.cmd run test:instancias`: dos procesos, misma BD, un solo líder y dos
  sesiones simultáneas.
- `npm.cmd run dist:win`: instalador NSIS firmado y blockmap generados.
- `npm.cmd run release:feed`: `release/latest.yml` generado después de firmar;
  su SHA-512 coincide con el instalador publicado.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.14.exe` — 145.546.128 bytes.
- SHA-256: `0CF6D37EFE7E6B67AB16CEC6A3FF4FDD46EC111B621AE3D04749C57EAB31D641`.
- SHA-512: `4EAB4CE8AE8A99738801B4B79B5EA66F239E6F9E1C37B4C7FB8972DF8BBF5B97AA3B3A9AAA4FEA91F4C39946B8612F778E1792E55EABC1E6E20378A71EE97CC0`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.14/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.14/EnterpriseProERP-Setup-0.5.14.exe.blockmap

El instalador se firma con `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
`60B08EC13A4D8B0B5039A1F9698994D55312CD0C`, sin marca de tiempo.
`Get-AuthenticodeSignature` informa `UnknownError` («termina en un certificado de
raíz no compatible con el proveedor de confianza»), el caso esperado con un
certificado autofirmado. SmartScreen no desaparece sin una CA pública.
