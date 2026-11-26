# Novedades de la versión 0.5.4

Esta versión corrige la fuente de actualizaciones de la `0.5.3` e incorpora las mejoras que
estaban pendientes tras la publicación de `0.5.2`: gestión de actualizaciones dentro del
programa y claves de acceso de 4 dígitos o más. No cambian las políticas duras de seguridad
ni el aislamiento por empresa.

## Corrección de la fuente de actualizaciones (0.5.4)

La `0.5.3` mostraba «fuente de actualización no configurada» porque electron-builder elimina
el campo `build` del `package.json` incluido en `app.asar`, y el proceso principal intentaba
leer `build.publish.url` desde ese archivo. Ahora la URL pública
`https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/latest/download/` reside en
`src/shared/actualizaciones.ts` y `urlFeedActualizacion()` la usa salvo que se defina
`ERP_UPDATE_URL`. Se verificó que la URL queda dentro del bundle empaquetado y que
electron-updater detecta una versión superior desde un feed local (`npm run test:updater`).

## 1. Actualizaciones dentro del programa

- Botón **Actualizaciones** en la barra superior, con punto verde cuando hay versión
  disponible o ya descargada. Se puede ocultar desde **Centro de control → Interfaz →
  Elementos ocultos** (`botonActualizaciones`).
- Panel reutilizable con **Buscar**, **Descargar instalador** y **Abrir carpeta**. Está en la
  barra superior y también dentro de **Acerca de**, compartiendo el mismo estado.
- La aplicación instalada consulta el feed una vez al arrancar (8 s después de iniciar el
  proceso principal). El archivo se guarda en `Descargas`; la instalación la ejecuta el
  usuario desde el Explorador. En ejecuciones sin empaquetar no se consulta el feed automáticamente.
- El renderer solo lee `update.estado` (cada 60 s para reflejar la comprobación de arranque);
  los cuatro canales `update.*` (`estado`, `verificar`, `descargar`, `abrirCarpeta`) siguen
  protegidos por `isTrusted` en el proceso principal.
- Fuente: URL pública de GitHub Releases incluida en el código, o `ERP_UPDATE_URL` si se
  define. No se lee del `package.json` empaquetado: electron-builder elimina el campo
  `build`, lo que hacía que la app instalada mostrara «fuente no configurada».

## 2. Claves de acceso de 4 dígitos o más

- `changePasswordSchema` acepta de 4 a 128 caracteres; se permiten PIN numéricos (`1234`),
  letras y símbolos. Ya no se exigen mayúscula, minúscula, número y carácter especial.
- El modal de cambio de clave muestra los nuevos requisitos y valida la misma regla antes
  de llamar al backend. El esquema Zod del router sigue siendo la autoridad final.
- Las contraseñas temporales de restablecimiento se mantienen largas y aleatorias.
- No cambian la sesión de 30 min, el cierre absoluto de 12 h, los 5 intentos fallidos,
  el hash scrypt con salt ni la auditoría.

## Compilación

- `npm run dist:win`: `EnterpriseProERP-Setup-0.5.4.exe` (145,487,952 bytes ya firmado).
- La compilación firma con el certificado autofirmado `CN=Enterprise Pro ERP (autofirmado)`
  (huella SHA-1 `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`) desde el propio
  electron-builder; de otro modo la directiva de Control de aplicaciones de Windows
  bloquea el stub NSIS sin firmar. `scripts/dist-win.mjs` aporta la contraseña del
  certificado y desactiva el timestamp de red. El resultado se vuelve a firmar con
  `scripts/firmar-instalador.ps1`. Como el certificado no procede de una CA pública,
  SmartScreen no desaparece.
- `npm run release:feed`: `release/latest.yml` generado desde el instalador firmado;
  tamaño y SHA-512 verificados contra el archivo real.
- `npm run test:updater`: detectó `0.5.5` desde un feed local de prueba con la `0.5.4` instalada.

## Verificación local

- `npm run typecheck`: correcto.
- `npm test`: 38 archivos, 246 pruebas.
- `npm run test:e2e`: 17 pruebas (incluye PIN de 4 dígitos y panel de actualizaciones).
- `npm run build`: correcto.
- `npm audit --omit=dev`: 0 vulnerabilidades.

Release: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/tag/v0.5.4

Instalador: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.4/EnterpriseProERP-Setup-0.5.4.exe

Feed: https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/download/v0.5.4/latest.yml

SHA-256 del instalador: `C76EFCAE1A3CAD5959FEF4CB9AB8B4824A6DEFAA5810640C409FB73B4BBF83F3`

SHA-512 del feed: `OAgAyfqH3WTbhgMApd9/JwwjMPl75Y+BBYfGzp3wQ+s1Y6ZtHm+dKOvD+bgfEkTa14yhalaOOpTFkRFNN1Nt7w==`
