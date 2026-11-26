# Novedades de la versión 0.5.8

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.8

Esta versión incluye todo lo publicado en `0.5.7` y corrige la pantalla negra tras
introducir la clave, además de conectar los ajustes administrativos que antes solo se
guardaban. Detalle técnico: [docs/22-correcciones-post-0.5.7.md](22-correcciones-post-0.5.7.md).

## Cambios

- **Acceso estable**: `ErrorBoundary` global y por vista, normalización de ajustes por grupo,
  tema avanzado acotado y recarga de preferencias al completar el cambio obligatorio de
  contraseña. Un perfil heredado con `ajustes.interfaz` parcial ya no deja `#root` vacío.
- **Flujos configurables**: aprobación en el alta de facturas/POS con umbral en centavos,
  motivo de anulación, estados de orden y confirmación de cierre de caja. Todo auditado,
  con `requirePermission` en backend y sin alterar stock, CxC ni CxP.
- **Panel 2026**: la vista y la métrica administrativas son defaults del filtro y
  `compararPeriodo` entrega ventas/cobros del periodo anterior en centavos.
- **Alertas y notificaciones**: umbrales de stock, CxC y series, nivel mínimo, destinos,
  duración y sonido aplicados de verdad en paneles, agenda e interfaz.
- **Estación y operación**: densidad, fuente, acento, animaciones, paginación, widgets,
  impresión/PDF, exportación, respaldos, actualizaciones, libros 606/607 y `VACUUM`
  programado leen su configuración desde los servicios reales.
- **Ajustes efectivos**: `config.ajustes.efectivos` entrega además `alertas`,
  `notificaciones` y `panel2026`. `seguridad`, `integraciones`, `rendimiento`, `flujos` y
  `fiscal` siguen aplicándose en el proceso principal sin exponerse al renderer.

## Seguridad

No cambian las políticas duras: `INACTIVITY_MINUTES = 30`, `ABSOLUTE_HOURS = 12`,
`MAX_FAILED_ATTEMPTS = 5`, `contextIsolation: true`, `nodeIntegration: false`, WAL/FKs,
transacciones, auditoría e importes en centavos. `buildContext` y `requirePermission` siguen
siendo la autoridad; los feature flags solo ocultan módulos opcionales y nunca conceden
permisos. Los módulos protegidos siguen siendo `dashboard`, `configuracion`, `seguridad` y
`respaldos`. No hay emisión ni certificación DGII: los libros 606/607 continúan siendo
borradores locales.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.8.exe` — 145.512.064 bytes.
- SHA-256: `6621136E94B3B6B7DA4D3864674D5D5E855997736E36E3570841C933056C1E93`.
- SHA-512: `JqBvZMmZt/c8WfQXJAp7Rh1Vp12WlqbZ3RZYiY5BS+51LnwbUyi7M/GoDuISyhU0P3l5l7QCzjJwQrXzW3NA8A==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.8/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.8/EnterpriseProERP-Setup-0.5.8.exe.blockmap

El instalador está firmado con el certificado autofirmado `CN=Enterprise Pro ERP
(autofirmado)` (huella SHA-1 `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`), sin timestamp.
SmartScreen permanece hasta usar un certificado de una CA pública.

El tag ligero `v0.5.8` se creó por GitHub API sobre el commit
`fe7b8a1c7ee90d470a5fdb47465519939e268c61`, el mismo HEAD remoto usado por `v0.5.7`. El
código de trabajo permanecía local porque no hay `git.exe` en el entorno; igual que en
releases anteriores, el código fuente 2026 no se subió como archivo de la release.

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 42 archivos, 303 pruebas.
- `npm run test:e2e`: 24/24, incluido el perfil sucio y la consola limpia.
- `npm run test:updater`: detectó `0.5.9` desde un feed local con la `0.5.8` instalada.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Las tres URLs públicas responden HTTP 200 y el `latest.yml` publicado coincide con
  `release/latest.yml`.
