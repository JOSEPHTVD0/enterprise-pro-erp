# Entrega final — ENTERPRISE PRO ERP 0.2.0

Fecha: 24 de noviembre de 2026 · Plataforma objetivo: Windows 10/11 x64 ·
Estado: **12/12 fases completas + cierre de limitaciones posteriores**.

## 1. Resumen ejecutivo

ENTERPRISE PRO ERP se entrega como aplicación de escritorio local, modular y funcional.
Las 12 fases del plan aprobado están cerradas, con **23 módulos activos y 0 módulos
inactivos**. No hay botones decorativos ni guardados simulados: las operaciones escriben en
SQLite real, pasan validación Zod y permisos en backend, y quedan auditadas cuando corresponde.

Después de la Fase 12 se cerraron, con autorización explícita, las limitaciones viables:
auditoría de dependencias de producción, PDF nativo con pdfmake, E2E con Playwright sobre
Electron por CDP, actualización automática con feed, firma autofirmada del instalador y
control de versiones Git. La impresión con `window.print()` se conserva y el PDF se añade como
salida adicional. No se modificó el bloque genérico de `src/main/ipc/router.ts` ni el preload;
las nuevas rutas se registraron como entradas `route(...)` o canales básicos protegidos por
`isTrusted`.

No se hicieron cambios de esquema, migraciones BD ni flujos financieros. No se afirma
certificación DGII ni emisión de e-CF.

## 2. Artefacto de entrega

| Campo | Valor |
|---|---|
| Instalador | `dist\EnterpriseProERP-Setup-0.2.0.exe` |
| Tamaño | 124.221.568 bytes |
| SHA-256 | `DBAA5D31DCBD3C17D5B62094F649CF57ACF155D047DF9DAD2992D6B86746728F` |
| Tipo | NSIS 3 Unicode, x64, per-usuario, carpeta configurable |
| Producto | ENTERPRISE PRO ERP 0.2.0 |
| AppID | `com.enterprisepro.erp` |
| Firma digital | **Autofirmada** (SHA-256, sin timestamp: no había acceso al servidor de tiempo) |
| Huella SHA-1 del certificado | `60B08EC13A4D8B0B5039A1F9698994D55312CD0C` |

La firma autofirmada **no elimina el aviso de SmartScreen**: Windows solo lo suprime con un
certificado de código emitido por una CA pública de confianza. Véase
[docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md).

Código fuente y documentación: `C:\Users\ferre\Downloads\prueba`. Repositorio Git inicializado
con un único commit.

## 3. Verificación final ejecutada

| Comando / comprobación | Resultado |
|---|---|
| `npm.cmd run typecheck` | Sin errores (`tsc --noEmit`). |
| `npm.cmd test` | **190/190** pruebas, **29 archivos** (integración + unitarios). |
| `npm.cmd run test:e2e` | **4/4** pruebas reales sobre Electron por CDP (login, IPC PDF, botón PDF, consola limpia). |
| `npm.cmd run test:updater` | `electron-updater` detectó `0.2.1` desde un feed HTTP local. |
| `npm.cmd run build` | main 435,42 kB · preload 1,52 kB · renderer 2,45 MB. |
| `npm.cmd run dist:win` | Instalador NSIS generado con `app.asar`, módulo nativo desempaquetado, icono y desinstalador. |
| `npm.cmd run release:feed` | `release\latest.yml` generado con SHA-512 del instalador firmado. |
| Firma | `Get-AuthenticodeSignature`: firmante `CN=Enterprise Pro ERP (autofirmado)`. Estado `UnknownError` por cadena no confiable, expected en autofirmado. |
| `npm.cmd audit --omit=dev` | **0 vulnerabilidades de producción**. |
| Módulos | 23 activos, 0 pendientes (`src\renderer\src\app\modules.ts`). |
| Código sin marcadores | Sin `TODO`/`FIXME` funcionales en `src`. |
| Arranque real instalado | Electron 37.10.3, BD creada, `integrity_check = ok`, versión 0.2.0, token no expuesto y sin errores propios de consola. |
| Desinstalación | Mensaje Sí/No visible; **No conserva** y **Sí elimina** el directorio de datos; comprobado con centinela. |

Evidencias anteriores de fases:

- `C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase10-result.json` — copia, integridad,
  restauración con doble confirmación, reinicio real y sesión invalidada.
- `C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase12-result.json` — arranque del exe
  instalado y verificación de SQLite/integridad.
- `C:\Users\ferre\AppData\Local\Temp\opencode\desinstalacion-fase12-result.json` — ambas
  ramas del diálogo de datos al desinstalar.

Nota: en el arranque se emite una única vez la sonda `auth.me` sin token; la UI la maneja
como "sesión no iniciada" y se separó explícitamente de los errores reales en la evidencia.

## 4. Cobertura funcional

| Área | Estado |
|---|---|
| Fundamentos, seguridad, migraciones y BD | Completa. |
| Maestros, importación/exportación Excel | Completa. |
| Inventario, costos, series/lotes y transferencias | Completa. |
| Ventas, POS, conversiones, NCF e impresión | Completa. |
| Compras, recepciones y CxP | Completa. |
| Finanzas: CxC, CxP, bancos, caja, gastos y conciliación | Completa. |
| Reportes, gráficas, 606/607 y exportación | Completa. |
| Auditoría y respaldos reales con restauración por etapas | Completa. |
| Pruebas integrales: IPC, impresión, rendimiento y persistencia | Completa. |
| Instalador NSIS, mantenimiento y firma | Completa (firma autofirmada). |
| PDF nativo (pdfmake) en documento, ticket y reporte | Completa. |
| E2E Playwright/CDP y verificación de feed de updates | Completa. |

Adaptación República Dominicana: DOP/RD$, RNC/cédula, ITBIS configurable, NCF, libros 606/607
y arquitectura preparada para e-CF. **No se afirma certificación DGII.**

## 5. Seguridad y operación

- Electron con `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` y navegación
  externa bloqueada desde el renderer.
- IPC con origen confiable, token en memoria del preload, token hasheado en BD, expiración por
  inactividad, allowlist de cambio de contraseña, permisos verificados en backend, esquemas Zod
  y errores serializados; el bloque genérico del router y el preload no se modificaron.
- `pdf.generar` no acepta datos del renderer: reutiliza `ventas`, `compras`, `finanzas` y
  `reportes` para que cada servicio compruebe permisos, empresa y existencia. La descarga usa el
  mismo patrón `{ filename, base64, mime }` que las exportaciones Excel.
- Los canales `update.estado`, `update.verificar`, `update.descargar` y `update.instalar` están
  en el grupo de IPC básico y usan el mismo `isTrusted` que `settings:*` y `app:get-info`.
- Contraseñas con `scrypt` + salt; bloqueo tras intentos fallidos; cambio obligatorio inicial.
- Transacciones reales, integridad referencial, auditoría y copias verificadas con
  `integrity_check`.
- Usuario inicial `admin` / `Admin1234!`, con cambio obligatorio en el primer arranque.
- Datos en `%APPDATA%\enterprise-pro-erp\data\enterprise.db`; preferencias en `settings.json`;
  respaldos en `backups\`; programa en `%LOCALAPPDATA%\Programs\ENTERPRISE PRO ERP` por defecto.
- Consulte [docs/05-instalacion-mantenimiento.md](05-instalacion-mantenimiento.md) antes de
  actualizar, restaurar o desinstalar.

## 6. Documentación de entrega

| Documento | Contenido |
|---|---|
| [README.md](../README.md) | Resumen, fases, ejecución y primeros pasos. |
| [01-arquitectura.md](01-arquitectura.md) | Capas, IPC, seguridad y decisiones técnicas. |
| [02-modelo-datos.md](02-modelo-datos.md) | Esquema SQLite, entidades e integridad. |
| [03-plan-desarrollo.md](03-plan-desarrollo.md) | Plan por fases, criterios y riesgos. |
| [04-informe-pruebas-fase11.md](04-informe-pruebas-fase11.md) | Suite integral y matriz de cobertura. |
| [05-instalacion-mantenimiento.md](05-instalacion-mantenimiento.md) | Instalación, actualización, datos y desinstalación. |
| [06-entrega-final.md](06-entrega-final.md) | Estado final, artefacto, hash y verificación. |
| [07-cierre-limitaciones.md](07-cierre-limitaciones.md) | PDF, E2E, feed, firma, Git y e-CF. |
| [08-guia-uso-y-publicacion.md](08-guia-uso-y-publicacion.md) | Instalación, primer arranque, uso por módulo, compilación, firma y publicación. |
| [adr/](adr/) | Decisiones 0001 a 0004. |

## 7. Limitaciones conocidas

- **SmartScreen**: la firma es autofirmada; no reduce advertencias sin certificado de CA pública.
- **Feed de actualizaciones**: el configurado es local (`http://127.0.0.1:8080/`) para pruebas.
  Para producción debe publicarse en HTTPS y sustituirse `build.publish.url` o `ERP_UPDATE_URL`.
- **Auditoría de desarrollo**: `npm audit` reporta 11 avisos (7 moderados, 2 altos, 2 críticos)
  en herramientas de desarrollo. Todos exigen cambios mayores (Electron 45, Vitest 5 o
  electron-builder 25) y no se aplicaron sin autorización. Producción: 0 vulnerabilidades.
- **e-CF**: solo preparación arquitectónica y borradores 606/607; no hay emisión, certificación
  ni integración con DGII.
- **No queda ninguna fase pendiente del plan.** Cualquier trabajo posterior —nueva funcionalidad,
  actualizaciones mayores de dependencias o cambios de BD/flujos financieros— requiere
  autorización explícita previa.
