# ADR 0004 — Cierre de limitaciones posteriores a la Fase 12

- Estado: Aceptado (autorización explícita del usuario).
- Fecha: 24 de noviembre de 2026.

## Contexto

Tras la Fase 12 quedaban limitaciones viables: dependencias de producción con avisos de
auditoría, impresión sin PDF descargable, ausencia de E2E automatizado real, instalación manual
de versiones, instalador sin firmar y proyecto sin control de versiones. Había que cerrarlas sin
alterar el bloque genérico del IPC, el preload, la BD ni los flujos financieros.

## Decisión

1. **Auditoría:** actualizar Zod a 4.6.7 y fijar `uuid` 11.1.1 mediante `overrides`. No aplicar
   correcciones mayores de desarrollo sin autorización.
2. **PDF:** usar pdfmake en el proceso principal, reutilizando los servicios de impresión y sus
   permisos; el renderer obtiene `{ filename, base64, mime }` y usa `descargarArchivo()`.
3. **E2E:** usar `@playwright/test` por CDP contra Electron, sin descargar navegadores.
4. **Actualizaciones:** usar `electron-updater` con proveedor `generic` y un feed local
   verificable; la URL de producción se sustituye al publicar.
5. **Firma:** certificado autofirmado con `signtool.exe` embebido; documentar explícitamente que
   SmartScreen no se elimina sin CA confiable.
6. **Git:** inicializar repositorio con un único commit.

## Consecuencias

- Positivas: 0 vulnerabilidades de producción, PDF real, regresiones E2E reproducibles, feed
  probado, instalador firmado localmente e historial versionado.
- Negativas / pendientes: en su momento quedaban 11 avisos de desarrollo; en 0.3.0 se
  autorizaron las actualizaciones mayores y los overrides, quedando `audit` en cero. El feed de
  pruebas sigue siendo local y la firma autofirmada no genera reputación en SmartScreen.
- Riesgo mitigado: las nuevas rutas IPC no amplían permisos; `pdf.generar` delega en servicios
  autorizados y los canales `update.*` usan `isTrusted`.
- e-CF sigue en preparación arquitectónica, sin certificación DGII.
