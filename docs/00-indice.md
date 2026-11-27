# 00 — Índice de documentación · ENTERPRISE PRO ERP

Este índice reúne la documentación **viva** del proyecto. Los documentos de novedades
por versión conservan sus cifras y artefactos históricos tal como se publicaron.

## Estado de la documentación

- **Release publicada: `v0.5.17`** (tag `v0.5.17`), con **57 archivos /
  390 pruebas** y **33/33 pruebas E2E** en Electron por CDP. Detalle:
  [38-novedades-0.5.17.md](38-novedades-0.5.17.md).
- La release incluye primitivos `Skeleton`/`EmptyState`/`LoadingState`/`StatCard`,
  `DataTable` con `loading`, acento único desde `--erp-acento`, escala de fuente real,
  i18n del shell, preferencias fiscales conectadas, flags vigentes, 41 vistas de
  `vistasPersonalizables` y el tablero horizontal avanzado con cinco paneles operativos
  reales y permisos por sección: [35-consistencia-ui-ajustes.md](35-consistencia-ui-ajustes.md)
  y [36-panel-horizontal-avanzado.md](36-panel-horizontal-avanzado.md).
- **Publicado en `v0.5.17`:** el panel de actualizaciones muestra el mensaje «Está
  actualizado… No hay descargas disponibles» y bloquea `update.descargar` cuando no hay
  versión nueva; con versión nueva solo guarda el instalador para que la instalación sea
  manual: [18-panel-actualizaciones-progreso.md](18-panel-actualizaciones-progreso.md)
  y [24-actualizacion-descarga-manual.md](24-actualizacion-descarga-manual.md).
- **Usuarios operativos semilla (publicado en `v0.5.17`):** `facturador` ve solo
  Facturación, `cobrador` ve solo Cobros y `admin` conserva ambos paneles; la separación
  usa los permisos reales de los módulos y se verifica también en el proceso principal.
- Las publicaciones futuras requieren autorización explícita. Este índice y cualquier
  otro documento son descriptivos: no ejecutan publicación, tag ni push.

## Avisos que aplican a todo el proyecto

- **DGI es solo rotulado visual.** No hay emisión de e-CF, exportación ni simulación de
  emisión, firma fiscal, envío a DGII ni certificación. Los libros 606/607 son
  borradores locales derivados de documentos reales; el NCF recibido del proveedor se
  guarda como referencia y el ERP nunca lo genera.
- **Borradores vs. comprobantes:** los borradores de facturación se guardan en
  `localStorage` del equipo; los comprobantes emitidos son inmutables y se anulan o
  reversan con trazabilidad.
- **Impresión:** el modo por defecto es `DIALOGO`; `SILENCIOSA` es una opción
  configurada por documento o estación, nunca un comportamiento automático por defecto.
- **Dinero:** se almacena en centavos enteros en SQLite; el formato `RD$` y los
  decimales son presentación de la estación.

## Inicio, estado y entregas

- [README.md](../README.md) — Resumen, fases, ejecución, verificación y primeros pasos.
- [00-indice.md](00-indice.md) — Este índice.
- [06-entrega-final.md](06-entrega-final.md) — Entrega, artefacto publicado, hash y verificación.
- [04-informe-pruebas-fase11.md](04-informe-pruebas-fase11.md) — Suite integral, inventario y matriz de cobertura.
- [11-entrega-final-0.4.0.md](11-entrega-final-0.4.0.md) — Cierre de la entrega 0.4.0 (histórico).

## Arquitectura, datos y decisiones técnicas

- [01-arquitectura.md](01-arquitectura.md) — Capas, IPC, seguridad, dinero y decisiones de diseño.
- [02-modelo-datos.md](02-modelo-datos.md) — Esquema SQLite, entidades, relaciones e integridad.
- [03-plan-desarrollo.md](03-plan-desarrollo.md) — Plan por fases, criterios de aceptación y riesgos.
- [adr/0001-better-sqlite3.md](adr/0001-better-sqlite3.md) — Decisión de SQLite nativo.
- [adr/0002-dinero-centavos.md](adr/0002-dinero-centavos.md) — Decisión de dinero en centavos.
- [adr/0003-instalador-nsis.md](adr/0003-instalador-nsis.md) — Decisión del instalador NSIS.
- [adr/0004-cierre-limitaciones.md](adr/0004-cierre-limitaciones.md) — Cierre de limitaciones posteriores a la Fase 12.

## Instalación, uso y mantenimiento

- [05-instalacion-mantenimiento.md](05-instalacion-mantenimiento.md) — Instalación, actualización, datos, respaldos y desinstalación.
- [08-guia-uso-y-publicacion.md](08-guia-uso-y-publicacion.md) — Guía funcional, compilación, firma y publicación.
- [07-cierre-limitaciones.md](07-cierre-limitaciones.md) — Auditoría, PDF, E2E, updater, firma, Git y e-CF.
- [24-actualizacion-descarga-manual.md](24-actualizacion-descarga-manual.md) — Descarga local e instalación manual del actualizador.
- [25-instancias-y-pantalla-negra.md](25-instancias-y-pantalla-negra.md) — Varias instancias y pantalla negra.
- [13-correccion-escritura-contrasena-0.5.1.md](13-correccion-escritura-contrasena-0.5.1.md) — Corrección del cambio obligatorio de contraseña.

## Funcionalidad por tema

- [09-novedades-0.3.0.md](09-novedades-0.3.0.md) — Preferencias avanzadas, panel ejecutivo y módulos 2026.
- [12-plan-centro-control-0.5.0.md](12-plan-centro-control-0.5.0.md) — Centro de control administrativo.
- [14-novedades-0.5.2.md](14-novedades-0.5.2.md) — Novedades de 0.5.2.
- [15-mejoras-locales-actualizaciones-y-pin.md](15-mejoras-locales-actualizaciones-y-pin.md) — Novedades de 0.5.4, feed público y PIN.
- [16-paneles-y-filtros-avanzados.md](16-paneles-y-filtros-avanzados.md) — Paneles organizados y filtrado avanzado.
- [17-novedades-0.5.5.md](17-novedades-0.5.5.md) — Novedades de 0.5.5.
- [18-panel-actualizaciones-progreso.md](18-panel-actualizaciones-progreso.md) — Panel de actualizaciones con progreso y descarga local.
- [19-novedades-0.5.6.md](19-novedades-0.5.6.md) — Novedades de 0.5.6.
- [20-paneles-y-ajustes-2026.md](20-paneles-y-ajustes-2026.md) — Paneles y ajustes avanzados 2026.
- [21-novedades-0.5.7.md](21-novedades-0.5.7.md) — Novedades de 0.5.7.
- [22-correcciones-post-0.5.7.md](22-correcciones-post-0.5.7.md) — Pantalla negra, instancias y claves de impresión.
- [23-novedades-0.5.8.md](23-novedades-0.5.8.md) — Novedades de 0.5.8.
- [26-novedades-0.5.9.md](26-novedades-0.5.9.md) — Novedades de 0.5.9.
- [27-ingreso-mercancia.md](27-ingreso-mercancia.md) — Ingreso de mercancía.
- [28-novedades-0.5.10.md](28-novedades-0.5.10.md) — Novedades de 0.5.10.
- [29-espacio-trabajo-local.md](29-espacio-trabajo-local.md) — Espacio de trabajo local.
- [30-novedades-0.5.11.md](30-novedades-0.5.11.md) — Novedades de 0.5.11.
- [31-novedades-0.5.12.md](31-novedades-0.5.12.md) — Panel **Facturación ECF** (rótulos locales).
- [35-consistencia-ui-ajustes.md](35-consistencia-ui-ajustes.md) — Publicado en `v0.5.16`: primitivos visuales, accesibilidad y ajustes conectados.
- [36-panel-horizontal-avanzado.md](36-panel-horizontal-avanzado.md) — Publicado en `v0.5.16`: tablero horizontal con cinco paneles operativos reales.
- [38-novedades-0.5.17.md](38-novedades-0.5.17.md) — Actualizador con estado «actualizado» y usuarios operativos con paneles separados.

## Historial de releases publicadas

Las cifras de cada nota corresponden **solo** a esa release; la publicada actual es `v0.5.17`.

- [09-novedades-0.3.0.md](09-novedades-0.3.0.md) — 0.3.0.
- [10-novedades-0.4.0.md](10-novedades-0.4.0.md) — 0.4.0.
- [12-plan-centro-control-0.5.0.md](12-plan-centro-control-0.5.0.md) — 0.5.0.
- [13-correccion-escritura-contrasena-0.5.1.md](13-correccion-escritura-contrasena-0.5.1.md) — 0.5.1.
- [14-novedades-0.5.2.md](14-novedades-0.5.2.md) — 0.5.2.
- [15-mejoras-locales-actualizaciones-y-pin.md](15-mejoras-locales-actualizaciones-y-pin.md) — 0.5.4.
- [17-novedades-0.5.5.md](17-novedades-0.5.5.md) — 0.5.5.
- [19-novedades-0.5.6.md](19-novedades-0.5.6.md) — 0.5.6.
- [21-novedades-0.5.7.md](21-novedades-0.5.7.md) — 0.5.7.
- [23-novedades-0.5.8.md](23-novedades-0.5.8.md) — 0.5.8.
- [26-novedades-0.5.9.md](26-novedades-0.5.9.md) — 0.5.9.
- [28-novedades-0.5.10.md](28-novedades-0.5.10.md) — 0.5.10.
- [30-novedades-0.5.11.md](30-novedades-0.5.11.md) — 0.5.11.
- [31-novedades-0.5.12.md](31-novedades-0.5.12.md) — 0.5.12.
- [32-novedades-0.5.13.md](32-novedades-0.5.13.md) — 0.5.13.
- [33-novedades-0.5.14.md](33-novedades-0.5.14.md) — 0.5.14.
- [34-novedades-0.5.15.md](34-novedades-0.5.15.md) — 0.5.15 (release anterior).
- [37-novedades-0.5.16.md](37-novedades-0.5.16.md) — 0.5.16 (release anterior).
- [38-novedades-0.5.17.md](38-novedades-0.5.17.md) — 0.5.17 (**release publicada actual**).
