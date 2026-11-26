# Novedades de la versión 0.5.7

Publicada el 26 de noviembre de 2026 con autorización explícita. Release:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.7

Esta versión incluye todo lo publicado en `0.5.6` y agrega el paquete de paneles y ajustes
2026 descrito en [docs/20-paneles-y-ajustes-2026.md](20-paneles-y-ajustes-2026.md).

## Cambios

- **Panel operativo 2026**: KPIs reales de ventas, cobros, CxC/CxP e inventario; tendencia,
  proyección de efectivo, envejecimiento, principales clientes y productos, alertas y módulos
  2026. Consulta de solo lectura `panel2026.resumen`, con Zod, SQL parametrizado y permiso
  `inteligencia.consultar`.
- **Mapa de capacidades 2026**: catálogo real de módulos, fases, permisos y características,
  con filtros y exportación CSV. No usa datos simulados ni servicios externos.
- **Preferencias de panel efectivas**: el panel ejecutivo aplica serie diaria o mensual,
  número de filas e intervalo de actualización desde `settings.panel`, `widgets` y
  `rendimiento`; los permisos se vuelven a verificar en backend.
- **Ajustes `panel2026`**: vista inicial, métrica principal, días de proyección, umbral de
  CxC, umbral de stock, filas, comparación y alertas. Guardado con validación Zod,
  transacción y auditoría.
- **Centro de control**: editor nuevo del grupo `panel2026`, sin feature flags sobre módulos
  protegidos.

## Seguridad

No cambian las políticas duras: `INACTIVITY_MINUTES = 30`, `ABSOLUTE_HOURS = 12`,
`MAX_FAILED_ATTEMPTS = 5`, `contextIsolation: true`, `nodeIntegration: false`, WAL/FKs,
transacciones, auditoría e importes en centavos. `buildContext` y `requirePermission` siguen
siendo la autoridad; los feature flags solo ocultan módulos opcionales. No hay emisión ni
certificación DGII: los libros 606/607 siguen siendo borradores locales.

## Artefactos

- Instalador: `EnterpriseProERP-Setup-0.5.7.exe` — 145.501.496 bytes.
- SHA-256: `51146A63856C71122D6FEDCAA643A55EFFB00D94FFE7B0C5660067130D3896DE`.
- SHA-512: `iqCUbJsbNhx2Ahu3bqT4gSC6DJZ0pDKCYvwCzjKI4ZMQtshU27TYUgQv5CTQ6sLvKoq7t/YutokwgxsEu24JTQ==`.
- Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.7/latest.yml
- Blockmap: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.7/EnterpriseProERP-Setup-0.5.7.exe.blockmap

El instalador está firmado con el certificado autofirmado `CN=Enterprise Pro ERP
(autofirmado)` (huella SHA-1 `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`), sin timestamp.
SmartScreen permanece hasta usar un certificado de una CA pública.

El tag ligero `v0.5.7` se creó por GitHub API sobre el commit `fe7b8a1c7ee90d470a5fdb47465519939e268c61`,
el mismo HEAD remoto usado por `v0.5.6`. El código de trabajo permanecía local porque no hay
`git.exe` en el entorno.

## Verificación

- `npm run typecheck`: correcto.
- `npm test`: 41 archivos, 266 pruebas.
- `npm run test:e2e`: 21/21.
- `npm run test:updater`: detectó `0.5.8` desde un feed local con la `0.5.7` instalada.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Las tres URLs públicas responden HTTP 200 y el `latest.yml` publicado coincide con
  `release/latest.yml`.
