# Paneles organizados y filtrado avanzado (cambios locales)

Estos cambios se publican en la versión `0.5.5`. La versión anterior estable es `0.5.4`.

## 1. Filtrado avanzado en todas las áreas

`DataTable` es el componente de tablas de casi todas las áreas, así que las mejoras llegan a
maestros (productos, clientes, proveedores, vendedores, catálogos), ventas, compras,
cobros/CxC/CxP, finanzas, inventario, contabilidad, reportes, auditoría, usuarios, roles,
configuración y módulos 2026.

- **Búsqueda por términos**: se ignoran acentos y mayúsculas; todos los términos deben
  aparecer en alguna columna, en cualquier orden. Se admiten frases literales entre comillas
  (`"cliente principal" A-01`).
- **Facetas por columna**: se mantienen los desplegables de valores poco cardinales.
- **Condiciones**: botón *Filtros avanzados* → *Agregar condición*. Operadores: contiene,
  igual, distinto, mayor, menor, entre, vacío y no vacío. Se pueden combinar varias reglas
  y se aplican todas a la vez.
- **Valores numéricos y fechas**: importes y fechas ISO se comparan por su valor, no por
  texto. El orden de columnas también usa comparación numérica/fecha.
- **Vistas guardadas**: cada tabla recuerda hasta 12 vistas por identificador estable
  (`localStorage`, clave `erp-vistas-*`). Incluyen búsqueda, facetas, reglas y orden.
  Son preferencias de interfaz: **nunca** sustituyen permisos ni filtros del backend.
- **Chips y limpieza**: los filtros activos se muestran como etiquetas removibles; *Limpiar*
  restablece búsqueda, facetas, reglas y orden.
- **CSV**: exporta exactamente el conjunto filtrado y las columnas visibles.

Las reglas incompletas se ignoran mientras se escriben, para no perder el foco ni obligar
a pausar la escritura en ningún campo.

Los paneles con búsqueda propia (panel de existencias, agenda de cobros/pagos, catálogo de
permisos del centro de control y roles) usan el mismo normalizador: sin acentos, sin
mayúsculas y con varios términos en cualquier orden.

## 2. Paneles más organizados

- El menú lateral muestra un bloque **Favoritos** con estrellas por módulo; se guardan
  hasta 12 módulos por dispositivo. Los favoritos respetan permisos y feature flags: si un
  módulo deja de estar disponible, desaparece también de favoritos.
- Cada grupo del menú muestra su número de módulos y el grupo activo se abre automáticamente.
  El orden y las etiquetas personalizadas siguen siendo los configurados en el backend.
- La búsqueda del menú y de `Ctrl+K` tolera acentos, varios términos y busca también en
  descripciones y características.

## 3. Búsqueda global con autoridad en el backend

`Ctrl+K` ya no descarga todos los maestros al renderer. Usa el canal `busqueda.global`:

- Esquema Zod: texto de 2 a 80 caracteres, entidades de una lista blanca, límite de 1 a 50.
- El servicio consulta solo la empresa de la sesión (`empresa_id`) y omite entidades para
  las que el usuario no tiene `*.consultar`.
- Busca en clientes, productos, proveedores, vendedores, categorías, marcas, unidades,
  listas de precio y devuelve resultados ordenados por relevancia (código/título).
- Nunca expone costos ni columnas sensibles: solo id, título, tipo y vista destino.
- Inactivos se excluyen por defecto; se pueden incluir explícitamente con permiso.
- El renderer solo muestra los resultados; el backend vuelve a verificar cada permiso.

## Archivos principales

- `src/renderer/src/lib/filtros-avanzados.ts` — reglas, términos, orden y vistas guardadas.
- `src/shared/texto.ts` — normalización y coincidencia de términos compartidas renderer/backend.
- `src/renderer/src/components/ui/DataTable.tsx` — interfaz de filtros y vistas.
- `src/renderer/src/app/Sidebar.tsx` — favoritos, conteos y búsqueda sin acentos.
- `src/renderer/src/app/CommandPalette.tsx` — paleta con resultados del backend.
- `src/main/services/busqueda.service.ts` — búsqueda global por empresa y permisos.
- `src/shared/schemas/busqueda.ts` — contrato Zod del canal.
- `src/main/ipc/router.ts` — registro de `busqueda.global` (sin permiso global: el servicio lo resuelve por entidad).

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 40 archivos, 257 pruebas (incluye filtros, vistas y búsqueda global).
- `npm run test:e2e`: 19/19 (incluye favoritos, filtros avanzados y escritura continua).
- `npm audit --omit=dev`: 0 vulnerabilidades.

Estas mejoras se publicaron en la versión `0.5.5` con autorización explícita. La release es
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.5 e incluye el instalador
firmado, `latest.yml` y el blockmap. SHA-256 del instalador:
`4CCC2CCE49BC2E837E0079DDA902E2A223690F47F4E92967C52829FC78690773`. SHA-512 del feed:
`RiQ/1v0LC2pIC60DAKofYJrV+GU1FLVokvmSksgVxJPhRbBj+5MCbG+kGCJHzM3pCfrFD63k1bijPp0QXf5fgA==`.
