# Novedades de la versión 0.5.5

Publicada el 25 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.5

Esta versión publica los paneles organizados, el filtrado avanzado y la búsqueda global
pendientes desde `0.5.4`. No cambian las políticas duras de seguridad, el aislamiento por
empresa ni la autoridad de `buildContext`/`requirePermission` en el backend.

## Cambios

- **Filtrado avanzado**: términos sin acentos, frases literales, facetas, reglas
  combinables, comparación real de fechas e importes en centavos, orden, chips, limpieza,
  columnas visibles, CSV filtrado y hasta 12 vistas guardadas por tabla.
- **Paneles organizados**: favoritos por dispositivo, grupos plegables con conteos y
  búsqueda tolerante a acentos en el menú y en `Ctrl+K`.
- **Búsqueda global**: canal `busqueda.global` con esquema Zod; el servicio filtra por
  `empresa_id` y por `*.consultar` entidad a entidad. El renderer solo muestra resultados.
- **Búsquedas propias** de existencias, agenda, centro de control y roles normalizadas con
  el mismo comparador de texto.

Las vistas y favoritos son preferencias locales: nunca sustituyen permisos ni filtros del
backend. Los módulos `dashboard`, `configuracion`, `seguridad` y `respaldos` siguen
protegidos y no pueden ocultarse con feature flags.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.5.exe` — 145.492.640 bytes.
- SHA-256: `4CCC2CCE49BC2E837E0079DDA902E2A223690F47F4E92967C52829FC78690773`.
- SHA-512: `RiQ/1v0LC2pIC60DAKofYJrV+GU1FLVokvmSksgVxJPhRbBj+5MCbG+kGCJHzM3pCfrFD63k1bijPp0QXf5fgA==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.5/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.5/EnterpriseProERP-Setup-0.5.5.exe.blockmap

El instalador está firmado con el certificado autofirmado `CN=Enterprise Pro ERP
(autofirmado)` (huella SHA-1 `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`), sin timestamp.
SmartScreen sigue apareciendo hasta emplear un certificado de una CA pública.

Durante la compilación, `scripts/compat-execfile.cjs` extrae el desinstalador NSIS con el
lector de electron-builder en lugar de ejecutar el stub bloqueado por la directiva de
Control de aplicaciones de Windows. El artefacto final se vuelve a firmar con
`scripts/firmar-instalador.ps1`.

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 40 archivos, 257 pruebas.
- `npm run test:e2e`: 19/19.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm run release:feed`: feed generado desde el instalador firmado.
- `npm run test:updater`: detectó `0.5.6` desde un feed local con la `0.5.5` instalada.
- Las tres URLs públicas de la release responden HTTP 200 y el `latest.yml` publicado
  coincide byte a byte con `release/latest.yml`.
