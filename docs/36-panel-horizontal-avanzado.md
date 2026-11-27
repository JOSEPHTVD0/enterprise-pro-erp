# 36 — Tablero horizontal avanzado

Este documento describe el lote incluido en la release publicada `v0.5.16`. El detalle
del artefacto y la verificación están en
[37-novedades-0.5.16.md](37-novedades-0.5.16.md). Las publicaciones futuras requieren
autorización explícita.

## Superficie

El tablero vive como pestaña adicional **Panel horizontal** al final de
`Espacio de trabajo` (`src/renderer/src/features/espacio/EspacioTrabajoPage.tsx`).
No se agregó un módulo de primer nivel: el catálogo de 41 módulos y la lista exacta
de `vistasPersonalizables` permanecen intactos, al igual que los selectores E2E
ya publicados y el rediseño de `FacturacionEcfPanel.tsx` de `v0.5.13`.

El componente `src/renderer/src/features/paneles/PanelHorizontalAvanzado.tsx`
presenta cinco tarjetas en una fila horizontal desplazable. Cada tarjeta se puede
reordenar con dos botones y colapsar; ambas preferencias se guardan en
`localStorage` de la estación y se validan al leerlas con los esquemas Zod
compartidos. El encabezado ofrece un filtro único y acciones reales:

- `desde` / `hasta` con formato `AAAA-MM-DD`.
- `texto` (hasta 60 caracteres) aplicado en backend.
- `limite` entre 1 y 50 filas por panel.
- `soloUrgentes` calculado en backend.
- `Actualizar` vuelve a invocar el canal real.
- `Exportar CSV` descarta los archivos generados desde los datos visibles, con BOM UTF-8.
- Cada tarjeta tiene un botón para abrir el módulo operativo correspondiente,
  habilitado sólo si el perfil posee el permiso real.

## Datos y permisos

Toda la información sale de SQLite mediante un único canal de solo lectura:
`panel.horizontal.resumen`. El canal usa `panelHorizontalFiltroSchema` (Zod) y
resuelve cada sección según permisos ya existentes; nunca crea permisos nuevos.
Las secciones denegadas se devuelven como `null` junto a su motivo, sin filtrar
datos al renderer.

| Panel | Fuente real | Permiso | Umbral/configuración |
|---|---|---|---|
| Cola de cobranza | `cxc_documentos`, `clientes`, `cxc_recibo_aplicaciones` | `cxc.consultar` | `alertas.cxcDiasVencimiento` |
| Ranking ABC y reposición | `existencias`, `movimientos_inventario`, `productos`, `almacenes` | `inventario.consultar` | `alertas.stockBajoUmbral`, `existencia_min` |
| Agenda operativa | `ordenes_servicio`, `orden_servicio_lineas`, `servicios_catalogo`, `crm_leads`, `crm_seguimientos` | `servicios.consultar` o `crm.consultar` | `fecha_compromiso`, `proximo_seguimiento` |
| Desviación presupuestaria | `presupuestos`, `presupuesto_lineas` | `presupuestos.consultar` | `alertas.presupuestoPct` |
| Cuadre operativo | `caja_sesiones`, `caja_movimientos`, `bancos_cuentas`, `bancos_movimientos`, `bancos_conciliaciones` | `cajas.consultar` o `bancos.consultar` | arqueo, saldo libro vs. banco |

La precedencia y los cálculos se hacen en los servicios, no en la interfaz:

- **Cobranza:** días vencidos, bucket (`CORRIENTE`, `1_15`, `16_30`, `31_60`, `MAS_60`),
  exceso sobre `limite_credito_cent`, fecha del último recibo aplicado y un `score`
  limitado a 100. No recalcula `cxc_documentos.saldo_cent`.
- **Inventario:** consumo de ventas del periodo sobre el kardex inmutable, cobertura
  en días, clasificación A/B/C por consumo acumulado y nivel `CRITICO`/`BAJO`/`NORMAL`.
  El importe de reposición se oculta cuando el perfil no tiene `productos.costo` ni
  `inventario.costo`.
- **Agenda:** órdenes vencidas/hoy/próximas, minutos estimados por
  `servicios_catalogo.duracion_min`, carga por técnico y leads con seguimiento vencido.
  Un perfil con sólo Servicios no ve CRM, y viceversa.
- **Presupuestos:** porcentaje ejecutado por línea, disponible y nivel según el
  umbral guardado en ajustes. No modifica presupuestos ni registra ejecución.
- **Cuadre:** teórico de caja contra arqueo, saldo de libros contra última
  conciliación y movimientos bancarios no conciliados sin documento de soporte.

Todos los canales son de lectura: no hay escrituras, por lo que no se genera auditoría
nueva. Las acciones existentes a las que enlaza el tablero ya están auditadas en sus
propios servicios. No se introduce DGII, emisión de e-CF ni simulación fiscal.

## Verificación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test -- --reporter=dot`: **386/386** pruebas en **56 archivos**.
  El lote añade `tests/integration/panel-horizontal.test.ts` (7 pruebas) y una
  prueba nueva en `tests/integration/ipc-router.test.ts`: permisos por sección,
  defaults Zod, rechazo de `limite: 999` y ausencia total de datos para un perfil
  sin permisos.
- `npm.cmd run test:e2e`: **31/31** tras rebuild; la prueba del espacio de trabajo
  abre la pestaña, verifica tres paneles, mueve una tarjeta y la colapsa.
- `npm.cmd run test:updater` y `npm.cmd run test:instancias`: correctos sobre el feed local.
  La release pública `v0.5.16` publica ese mismo feed en
  https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.16/latest.yml
