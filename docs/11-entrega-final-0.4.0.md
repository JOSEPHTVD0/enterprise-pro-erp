# Entrega final — ENTERPRISE PRO ERP 0.4.0

Fecha: 25 de noviembre de 2026 · Plataforma: Windows 10/11 x64 ·
Estado: **completa, verificada y publicada**.

## 1. Resultado

La versión 0.4.0 cierra la Fase 14 sobre la 0.3.0. Tiene **31 módulos activos y 0
pendientes**. La numeración administrativa es consecutiva sin saltos y se añadió
Contabilidad general con plan de cuentas, periodos, asientos, libros, balances e
integración real de ventas.

La implementación es original. SAINT Enterprise se consultó solo como referencia
funcional pública. No se copió código ni interfaz propietaria.

## 2. Cambios incluidos

| Área | Entrega |
|---|---|
| Numeración | `series.repo.ts` como numerador único; `prefijo + subserie + correlativo continuo`; reserva `UPDATE ... RETURNING` dentro de la transacción del documento; rollback sin hueco; vista previa sin consumo. |
| Control de series | Validación de serie activa, rango y vencimiento antes de reservar; bloqueo de cambios estructurales con movimientos; estados AGOTADA, VENCIDA, INACTIVA y ALERTA en salud. |
| Contabilidad | Migración `008`; serie `ASI-`; cuentas, periodos, asientos balanceados, confirmación, anulación, libro diario, mayor, balance de comprobación, estado de resultados y balance general. |
| Integración | Ventas confirmadas generan asientos reales; se omiten las ya integradas y los periodos cerrados. |
| Seguridad | Permisos `contabilidad.*` verificados en rutas IPC y servicios; auditoría en cada escritura; Context Isolation activo y Node Integration desactivado; bucle IPC genérico y preload sin cambios. |
| Interfaz | Página de Contabilidad con pestañas de cuentas, asientos, periodos y libros/balances; configuración muestra próximo número y estado de cada serie. |

## 3. Verificación ejecutada

| Comando | Resultado |
|---|---|
| `npm.cmd run typecheck` | Sin errores de TypeScript. |
| `npm.cmd test` | **220/220** pruebas en 33 archivos. |
| `npm.cmd run build` | main, preload y renderer compilados. |
| `npm.cmd run test:e2e` | **4/4** pruebas reales en Electron por CDP. |
| `npm.cmd run test:updater` | Feed local coherente con la versión del paquete. |
| `npm.cmd audit` | 0 vulnerabilidades. |
| `npm.cmd audit --omit=dev` | 0 vulnerabilidades. |
| `npm.cmd run dist:win` | Instalador NSIS generado. |
| `scripts\firmar-instalador.ps1` | Instalador firmado de forma autofirmada. |
| `npm.cmd run release:feed` | `release/latest.yml` regenerado después de firmar. |

## 4. Artefacto

- Instalador: `EnterpriseProERP-Setup-0.4.0.exe`.
- Tamaño: 145.441.112 bytes.
- SHA-256: `26654D42C6D66500E10233BCB7B64BE3C0D1014F5EC17E69644E5AE3CAC199E4`.
- SHA-512 (Base64): `bPwlk7hq1G/WuCot2sCxm485DqenGObGbkehsZfmsPjC08qGmAB17UQIiSa7CTEQ5WJM5CuOk4zYs9/1qZJgLA==`.
- Certificado: `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
  `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`.
- Release: `v0.4.0` en `https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.4.0`.

La copia en `release/` y la copia en `dist/` tienen el mismo SHA-256. El hash del feed
corresponde al instalador firmado.

## 5. Limitaciones honestas

- La firma es autofirmada: reduce avisos de origen desconocido pero **no elimina
  SmartScreen** sin un certificado de CA pública.
- El feed de producción sigue apuntando a `http://127.0.0.1:8080/`; en producción debe
  sustituirse por HTTPS o definirse `ERP_UPDATE_URL`.
- No hay emisión de e-CF ni certificación DGII. La preparación fiscal y los NCF siguen
  basados en documentos reales.

## 6. Documentación relacionada

- [10-novedades-0.4.0.md](10-novedades-0.4.0.md) — detalle funcional y de verificación.
- [09-novedades-0.3.0.md](09-novedades-0.3.0.md) — versión anterior.
- [07-cierre-limitaciones.md](07-cierre-limitaciones.md) — cierre de limitaciones de Fase 12.
