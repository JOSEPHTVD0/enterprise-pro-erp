# Cierre de limitaciones posteriores a la Fase 12

Este documento describe el trabajo adicional autorizado tras cerrar las 12 fases. No cambia
esquemas de BD, flujos financieros ni el bloque genérico del router IPC.

## 1. Auditoría de dependencias

- `zod@4.6.7` y `overrides.uuid=11.1.1` corrigen los avisos de producción.
- `npm.cmd audit --omit=dev` → **found 0 vulnerabilities**.
- `npm.cmd audit` → 11 avisos de **desarrollo**. Sus correcciones son mayores: Electron 45,
  Vitest 5 o electron-builder 25 (downgrade desde 26). No se aplicaron porque requieren
  autorización y regresiones amplias. **No afectan al instalador ni a datos de producción.**

## 2. PDF nativo

- Dependencias: `pdfmake@0.3.15` y `@types/pdfmake@0.2.10`.
- Servicio: `src/main/services/pdf.service.ts`. Genera el PDF en **main** reutilizando los
  servicios de impresión existentes. El renderer solo envía `origen`, `id`/`reporte`, `formato`
  y `tipo`; nunca datos del documento.
- Ruta segura: `pdf.generar` en `src/main/ipc/router.ts`, sin permiso propio porque delega en
  `ventas.imprimir`, `compras.imprimir`, `cxc/cxp/bancos/cajas.imprimir` o `reportes.imprimir`.
- Descarga: `src/renderer/src/lib/pdf.ts` reutiliza `descargarArchivo()` de inventario.
- Botones «Guardar PDF» en Facturación, Cotizaciones, POS, Compras, CxC, CxP, Bancos, Cajas
  y Reportes. La impresión con `window.print()` sigue disponible.
- Formatos: `CARTA`, `MEDIA`, `TICKET_80` y `TICKET_58`. Los tickets usan puntos numéricos en
  `pageSize` por una limitación de pdfmake 0.3 con cadenas `mm`.
- Pruebas: `tests/unit/pdf.test.ts` (4 pruebas) y la prueba E2E del botón de Reportes.

## 3. E2E con Playwright

- Dependencia: `@playwright/test@1.65.1`. **No se descargaron navegadores**; Playwright se conecta
  por CDP al Electron de la aplicación.
- Configuración: `playwright.config.ts`, `workers: 1`, `testDir: ./tests/e2e`.
- `tests/e2e/app.spec.ts` crea un perfil temporal, lanza Electron con
  `--remote-debugging-port`, inicia sesión, cambia la contraseña obligatoria y comprueba:
  arranque real, `pdf.generar` por IPC, botón PDF de Reportes y consola sin errores propios.
- Ejecutar:

```powershell
npm.cmd run test:e2e
```

## 4. Actualización automática

- Dependencia: `electron-updater@6.8.11`, proveedor `generic`.
- Fuente: variable `ERP_UPDATE_URL` (prioridad) o `build.publish.url` de `package.json`.
  Valor por defecto para pruebas: `http://127.0.0.1:8080/`.
- Servicio: `src/main/services/updater.service.ts`. `autoDownload = false`;
  `autoInstallOnAppQuit = true`; `forceDevUpdateConfig = true` permite probar sin empaquetar.
- Canales IPC básicos (mismo `isTrusted` que `settings:*`): `update.estado`,
  `update.verificar`, `update.descargar`, `update.instalar`.
- UI: botón **Buscar** en *Acerca de*, seguido de **Descargar** e **Instalar y reiniciar**.
- Generar y servir el feed local:

```powershell
npm.cmd run dist:win
npm.cmd run release:feed
npm.cmd run release:serve
```

`scripts/generar-feed.mjs` copia el instalador a `release\`, calcula SHA-512 y escribe
`release\latest.yml`. `scripts/servir-feed.mjs` lo expone solo en `127.0.0.1`.

Verificación automática:

```powershell
npm.cmd run test:updater
```

El script levanta un feed efímero con versión `0.2.1`, lanza Electron con `ERP_UPDATE_URL` y
comprueba que `update.verificar` devuelve `disponible: true` y `version: '0.2.1'`.

**Producción:** publicar el instalador y `latest.yml` en un servidor HTTPS y reemplazar la URL.
No usar el feed local en equipos de usuario final.

## 5. Firma del instalador

- `npm.cmd run dist:win` llama a `scripts/dist-win.mjs`, que precarga
  `scripts/compat-execfile.cjs` con `NODE_OPTIONS=--require`. Es un shim de compatibilidad:
  electron-builder 26 ejecuta el stub del desinstalador con un entorno que solo contiene
  `__COMPAT_LAYER`; con Node 24 eso provoca `spawn UNKNOWN` por falta de `SystemRoot`. El shim
  fusiona ese entorno con el del proceso sin modificar dependencias ni el instalador.
- No había `signtool.exe` de Windows Kits en PATH; se usa el incluido en
  `node_modules/@electron/windows-sign/vendor/signtool.exe`.
- Certificado autofirmado SHA-256/RSA 2048, válido 3 años, creado en
  `build\certs\enterprise-pro-erp-selfsigned.pfx` (ignorado por Git).
- Script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\firmar-instalador.ps1
```

Si no hay acceso a `http://timestamp.digicert.com`, la firma se aplica **sin timestamp**; se
registró ese caso. Para regenerar el certificado: `-Regenerar`.

- Verificación: `Get-AuthenticodeSignature` muestra el firmante
  `CN=Enterprise Pro ERP (autofirmado)` y huella SHA-1
  `60B08EC13A4D8B0B5039A1F9698994D55312CD0C`. `signtool verify /pa` devuelve error de cadena
  por tratarse de una raíz no confiable; es esperado.
- **SmartScreen no desaparece.** Solo un certificado de código de una CA pública confiable
  permite acumular reputación y eliminar la advertencia. No se afirma lo contrario.

Tras firmar se regeneró `release\latest.yml` para que el SHA-512 coincida con el instalador
firmado.

## 6. Git

- El proyecto no tenía repositorio. Se inicializó Git y se dejó **un único commit** con todo el
  código y la documentación. `node_modules`, `out`, `dist`, `release`, `build/certs` y
  `test-results` están en `.gitignore`.
- Para consultar el hash: `git log -1 --format=%H`.

## 7. e-CF (solo preparación)

- Se conservan DOP/RD$, RNC/cédula, ITBIS configurable, NCF y libros 606/607 como borradores
  locales derivados de documentos reales.
- No hay emisión de e-CF, firma fiscal, envío a DGII ni certificación. Cualquier avance en esa
  área requiere autorización y análisis fiscal previo.
