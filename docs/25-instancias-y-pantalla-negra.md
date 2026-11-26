# Pantalla negra al reabrir y varias instancias simultáneas

Publicado en `0.5.9`:
https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.9

## Síntoma

La primera sesión entraba bien; después de un tiempo, al cerrar y volver a abrir y
escribir las credenciales, la ventana quedaba oscura y no mostraba ningún módulo.
Además se necesita abrir el ERP varias veces a la vez.

## Causas corregidas

1. **Instancia única**: el segundo lanzamiento terminaba y solo enfocaba la ventana
   anterior. Si esa ventana tenía el renderer caído o el árbol de React vacío, enfocarla
   no la reparaba. Se eliminó `requestSingleInstanceLock()`; cada lanzamiento crea su
   propia ventana.
2. **Sin recuperación del renderer**: no había manejo de `did-fail-load`,
   `render-process-gone` ni `unresponsive`. Ahora el proceso principal recarga hasta 3
   veces con 300 ms de separación y deja constancia en consola.
3. **«Recargar interfaz» inerte**: `will-navigate` cancelaba cualquier navegación en el
   build empaquetado porque `ELECTRON_RENDERER_URL` no existe. Ahora solo se bloquean
   URLs ajenas a la página local; el fallback usa el nuevo canal IPC `app:reload`.
4. **Cambio de clave obligatorio**: la rama `mustChangePassword` renderizaba solo el
   modal sobre un fondo oscuro. Se añade una pantalla de fondo con el nombre del ERP y
   la instrucción, de modo que nunca quede una ventana negra si el portal falla.
5. **Bloqueo de SQLite en el arranque simultáneo**: dos procesos aplicando la misma
   migración podían producir `database is locked`. La inicialización usa un archivo de
   bloqueo temporal y transacciones `BEGIN IMMEDIATE`; WAL y `busy_timeout` siguen activos.

## Varias instancias con la misma base de datos

- Las instancias comparten `%APPDATA%\enterprise-pro-erp` y `data\enterprise.db`.
- Cada proceso registra un latido en `instancias\`. Si una instancia muere sin limpiar,
  su registro expira a los 45 s.
- `instancia-lider.json` elige un solo dueño de tareas globales: respaldos automáticos,
  VACUUM, cola de exportaciones, restauración pendiente y búsqueda inicial de
  actualizaciones. Las demás ventanas solo atienden su interfaz.
- El arranque ya no cierra todas las sesiones activas. `buildContext()` aplica
  inactividad de 30 min y vigencia absoluta de 12 h en cada llamada, así que entrar en
  una instancia no desloguea a las demás.
- `settings.json` usa un archivo temporal por PID para que dos instancias no se pisen
  al guardar preferencias.
- **Restaurar un respaldo** sigue exigiendo una sola instancia abierta: reemplazar la BD
  con otras conexiones activas puede perder datos. El backend rechaza la operación con
  un mensaje explícito mientras haya más de un proceso registrado.

## Canales y confianza

- Nuevo canal `app:reload`, protegido por el mismo `isTrusted` que `settings:*`.
- No se abre el IPC a ventanas externas: cada proceso confía solo en su propia ventana.
- `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true` se conservan.

## Archivos implicados

- `src/main/index.ts`: sin lock de instancia única, recuperación del renderer,
  `will-navigate` correcto, liderato y registro de instancias.
- `src/main/services/liderato.service.ts` e `instancias.service.ts` (nuevos).
- `src/main/db/connection.ts` y `src/main/db/seed.ts`: arranque concurrente seguro.
- `src/main/services/context.ts` y `src/main/ipc/router.ts`: sesiones y guarda de
  restauración.
- `src/main/settings.ts`: temporal por PID.
- `src/renderer/src/components/ui/ErrorBoundary.tsx` y `src/renderer/src/app/App.tsx`.
- `tests/unit/liderato.test.ts`, `tests/unit/instancias.test.ts`,
  `tests/integration/persistencia.test.ts`, `tests/integration/respaldos.test.ts` y
  `tests/e2e/app.spec.ts`.
- `scripts/verificar-instancias.mjs`: abre dos procesos con el mismo perfil, entra en
  ambos y comprueba que la primera sesión siga activa.

## Verificación local

- `npm.cmd run typecheck`: correcto.
- `npm.cmd test`: 45 archivos, 314 pruebas.
- `npm.cmd run test:e2e`: 25/25, incluida la recarga IPC y el ingreso posterior.
- `npm.cmd run test:instancias`: dos procesos activos, un solo líder y dos sesiones
  simultáneas sobre la misma BD.
