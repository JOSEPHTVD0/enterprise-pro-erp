# 35 — Consistencia de módulos, ajustes e interfaz

Este documento describe el lote incluido en la release publicada `v0.5.16`. Las cifras
vigentes de pruebas y el artefacto se indican en [README.md](../README.md),
[00-indice.md](00-indice.md) y [37-novedades-0.5.16.md](37-novedades-0.5.16.md). Las
publicaciones futuras requieren autorización explícita.

## Principio

Ninguna pantalla, ajuste o primitivo debe quedar decorativo sin consumidor real.
Cuando un valor no puede tener efecto seguro, se retira del editor o se rotula como
informativo. Los permisos, transacciones, Zod y auditoría se conservan intactos.

## Interfaz

- Primitivos `Skeleton`, `SkeletonChart`, `EmptyState`, `LoadingState` y `StatCard`.
- `DataTable` con `loading`, `aria-busy`, encabezados `scope="col"`, `aria-sort`,
  orden con `aria-label` y paginación con `aria-current`.
- `App.tsx` usa `LoadingState` en el arranque y `EmptyState` para vistas inexistentes.
- Doce listados dejaron de usar `emptyText={cargando ? 'Cargando…' : …}` y usan
  `loading={cargando}` con texto vacío estable.
- Dashboard, panel ejecutivo y panel comercial usan `StatCard`, esqueletos y estados
  vacíos; sus gráficas toman el color de `var(--erp-acento)`.
- `Modal`: `aria-labelledby`, `aria-describedby`, trampa de foco y foco restaurado.
- `Tabs`: grupo con `aria-pressed`, navegación con flechas/Home/End y panel con
  `role="region"`, sin romper los selectores existentes de automatización.
- `Toast`: `alert`/`assertive` para errores y advertencias; `status`/`polite` para el resto.
- `CommandPalette`: diálogo modal y cuadro de búsqueda con `aria-controls`.
- `Field`, `TextInput` y `NumberInput`: etiqueta asociada al control y ayuda vía
  `aria-describedby`.

## Ajustes conectados

- Idioma del marco: etiquetas del shell traducidas al inglés cuando la estación lo elige;
  el contenido de negocio sigue en español.
- Moneda, decimales y formato de fecha: `money()` y `formatFecha()` respetan la
  configuración fiscal persistida.
- Libros 606/607: las pestañas visibles en Reportes dependen de los interruptores
  fiscales de la estación.
- Recordatorio de series NCF: depende de `fiscal.recordatorioNcf` además de los
  umbrales y destinos de alertas.
- `panel.verCostos` y `panel.verSalud`: ocultan utilidad/margen y alertas de salud
  en el panel ejecutivo.
- `featureFlags` en el mapa de capacidades reflejan los flags vigentes, no los defaults.
- `vistasPersonalizables` incluye las 41 vistas del catálogo; `dominioDeVista` corrige
  los dominios compartidos.
- Tras guardar o restaurar ajustes se recargan las preferencias globales.
- `seguridad.exigirClaveAnulacion` se conserva en el esquema sólo para migrar
  preferencias antiguas: la verificación de identidad se resuelve en el backend y
  el control engañoso se retiró del editor.
- La detección de impresoras muestra el error cuando falla, en lugar de una lista vacía
  sin explicación.

## Seguridad y salida

- `impresion.listar()` devuelve una lista vacía y segura si la API de impresión no está
  disponible o falla; `impresion.ejecutar()` sí conserva el error de validación.
- La espera del área de impresión usa `MutationObserver` y `requestAnimationFrame`
  con topes, en lugar de una pausa fija de 80 ms.
- En `route()`, un `input` ausente se valida con los defaults del esquema Zod; el sobre
  completo nunca se parsea, por lo que el token no llega a los servicios.
- Los canales heredados sin invocador en la UI se conservan documentados, con permiso
  y validación intactos.
- Las exportaciones reales (maestros, ventas, compras, inventario, finanzas, reportes
  y espacio de trabajo) escriben auditoría `EXPORTAR`; un rechazo por permiso no genera
  auditoría.

## Tablero horizontal avanzado

Se agregó una pestaña **Panel horizontal** al final de Espacio de trabajo, sin tocar
los módulos de primer nivel ni el panel de Facturación ECF publicado en `v0.5.13`.
El tablero consulta un único canal `panel.horizontal.resumen`, con Zod compartido y
permisos existentes resueltos por sección en backend. Incluye cola de cobranza,
ranking ABC de inventario, agenda de servicios/CRM, desviación presupuestaria y
cuadre de caja/banca. Cada tarjeta se reordena y colapsa; el tablero completo se
filtra, actualiza y exporta a CSV desde datos reales. Las secciones sin permiso se
informan como denegadas en lugar de mostrar datos. Detalle completo:
[36-panel-horizontal-avanzado.md](36-panel-horizontal-avanzado.md).

## Límites honestos

- DGI continúa siendo rótulo visual: no hay emisión, exportación ni simulación de e-CF.
- `PREPARACION_E_CF` es informativo; el ERP solo administra NCF locales.
- Los borradores de facturación viven en `localStorage`; los comprobantes emitidos son inmutables.
- El modo de impresión por defecto sigue siendo `DIALOGO`.
