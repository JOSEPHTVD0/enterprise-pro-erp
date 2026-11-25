# Novedades y verificación — ENTERPRISE PRO ERP 0.4.0

Fecha: 25 de noviembre de 2026 · Plataforma: Windows 10/11 x64 ·
Estado: **Fase 14 completada; 31 módulos activos y 0 pendientes**.

## 1. Alcance

Esta versión completa la paridad administrativa solicitada sobre la referencia funcional
pública de SAINT Enterprise, sin copiar código ni interfaz propietaria. Mantiene la
arquitectura de seguridad aprobada: Context Isolation activo, Node Integration desactivado,
IPC con origen confiable, permisos y auditoría verificados en backend, transacciones SQLite
e integridad referencial.

No se afirma certificación DGII ni emisión de e-CF. Se conservan el uso de NCF y los libros
fiscales derivados de documentos reales. El feed de actualizaciones indicado en el README
sigue siendo local y debe sustituirse por HTTPS en producción.

## 2. Numeración consecutiva sin saltos

`src/main/repositories/series.repo.ts` es la única implementación canónica. Toda numeración
sigue el formato `prefijo + subserie + correlativo continuo` (por ejemplo, `FAC-00000001`,
`FAC-00000002`). No se rellena con números uno a uno ni se reinicia por documento.

- La validación de serie activa, rango y vencimiento ocurre **antes** de reservar.
- La reserva usa `UPDATE ... RETURNING` dentro de la transacción del documento. Si la
  operación falla o se hace rollback, el correlativo no se consume.
- `config.serie.reservar` pasó a ser vista previa y se añadieron `config.serie.preview` y
  `config.series.estado`; el panel de configuración ya no permite editar el correlativo.
- `configuracion.repo.ts`, `modulos2026.service.ts`, `ventas.service.ts`, `router.ts` y
  `salud.service.ts` delegan en el numerador central. No queda un `SELECT` + `UPDATE`
  independiente en los módulos 2026.
- La configuración bloquea cambios de prefijo, subserie, longitud o correlativo de series
  con movimientos. El panel de salud muestra AGOTADA, VENCIDA, INACTIVA o ALERTA.

La prueba `tests/integration/series-consecutivas.test.ts` cubre consecutividad, vista previa
sin consumo, rollback sin hueco, series inactivas/vencidas, guardas de edición, módulos 2026
y alertas del panel de salud.

## 3. Contabilidad general (migración 008)

Se añadió un módulo contable propio con plan de cuentas, periodos, asientos, líneas, libros y
balances. Todos los importes viajan y se almacenan como enteros en centavos.

| Área | Funcionalidad |
|---|---|
| Plan de cuentas | Cuentas base sembradas por empresa, tipo, naturaleza, nivel, padre y estado. |
| Periodos | Apertura y cierre mensual; el cierre exige que no queden borradores. |
| Asientos | Numeración `ASI-` consecutiva, balance debe = haber, confirmación y anulación con auditoría. |
| Libros | Libro diario y mayor individual sobre asientos confirmados no anulados. |
| Balances | Balance de comprobación, estado de resultados y balance general. |
| Integración | Ventas confirmadas pendientes generan asientos reales y evitan duplicados. |

Canales IPC nuevos: `cont.cuentas`, `cont.cuenta.crear`, `cont.cuenta.modificar`,
`cont.cuenta.estado`, `cont.periodos`, `cont.periodo.abrir`, `cont.periodo.cerrar`,
`cont.asientos`, `cont.asiento.crear`, `cont.asiento.confirmar`, `cont.asiento.anular`,
`cont.libroDiario`, `cont.mayor`, `cont.balanceComprobacion`, `cont.estadoResultados`,
`cont.balanceGeneral` y `cont.integrar`.

Permisos nuevos verificados en backend y en la capa de rutas:
`contabilidad.consultar`, `contabilidad.crear`, `contabilidad.modificar`,
`contabilidad.anular`, `contabilidad.asiento.confirmar`, `contabilidad.periodo.cerrar` y
`contabilidad.integrar`.

El bucle genérico de `src/main/ipc/router.ts` y `src/preload/index.ts` no se modificaron;
las rutas se añadieron como entradas `route(...)` explícitas.

## 4. Verificación real

| Comando | Resultado |
|---|---|
| `npm.cmd run typecheck` | Sin errores. |
| `npm.cmd test` | **220/220** pruebas en 33 archivos. |
| `npm.cmd run build` | main + preload + renderer compilados. |
| `npm.cmd run test:e2e` | **4/4** pruebas reales en Electron por CDP. |
| `npm.cmd run test:updater` | Feed local coherente con `0.4.0`. |
| `npm.cmd audit` | 0 vulnerabilidades. |
| `npm.cmd audit --omit=dev` | 0 vulnerabilidades. |
| `npm.cmd run dist:win` | `EnterpriseProERP-Setup-0.4.0.exe`, 145.441.112 bytes. |
| `scripts\firmar-instalador.ps1` | Instalador firmado de forma autofirmada. |
| `npm.cmd run release:feed` | `release/latest.yml` regenerado tras la firma. |

## 5. Artefacto publicado

- Instalador: `EnterpriseProERP-Setup-0.4.0.exe`.
- SHA-256: `26654D42C6D66500E10233BCB7B64BE3C0D1014F5EC17E69644E5AE3CAC199E4`.
- SHA-512 (Base64): `bPwlk7hq1G/WuCot2sCxm485DqenGObGbkehsZfmsPjC08qGmAB17UQIiSa7CTEQ5WJM5CuOk4zYs9/1qZJgLA==`.
- Certificado: `CN=Enterprise Pro ERP (autofirmado)`, huella SHA-1
  `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`. La firma autofirmada no elimina SmartScreen.

## 6. Estado honesto

- 31 módulos activos, 0 pendientes: se añadió Contabilidad general a los 30 de 0.3.0.
- La integración contable cubre ventas confirmadas reales; no genera asientos de documentos
  inexistentes ni datos de demostración.
- La UI y el código son originales; SAINT Enterprise solo se usó como referencia funcional
  pública.
- No existe emisión de e-CF ni certificación DGII.
