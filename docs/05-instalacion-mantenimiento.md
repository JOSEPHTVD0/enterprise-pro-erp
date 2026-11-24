# Instalación y mantenimiento — ENTERPRISE PRO ERP 0.2.0

Windows 10/11 x64. El usuario final **no necesita Node.js ni instalar dependencias**: el
instalador incluye Electron 37.10.3, el renderer compilado y el módulo SQLite nativo.

## 1. Obtener el instalador

El artefacto generado es:

```text
dist\EnterpriseProERP-Setup-0.2.0.exe   (124.221.568 bytes)
SHA-256: DBAA5D31DCBD3C17D5B62094F649CF57ACF155D047DF9DAD2992D6B86746728F
```

Para regenerarlo desde el código fuente:

```powershell
npm.cmd install
npm.cmd run dist:win
```

`dist:win` ejecuta `npm run build` y luego `electron-builder --win --x64`. El resultado es un
NSIS per-usuario; la carpeta de instalación se puede cambiar en el asistente. Para
despliegues silenciosos, NSIS admite `/S`, `/D=ruta`, `/ND` (sin acceso directo de escritorio)
y `/NM` (sin acceso directo en menú), por ejemplo:

```powershell
.\EnterpriseProERP-Setup-0.2.0.exe /S /ND /NM /D=C:\ERP\EnterprisePro
```

El instalador está firmado con un certificado **autofirmado** (SHA-256). Al ejecutarlo por
primera vez Windows SmartScreen **puede seguir mostrando una advertencia**: solo un certificado
de código de una CA pública confiable permite eliminarla. Esto no afecta la operación local.
Detalles en [docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md).

## 2. Primer arranque

1. Abrir `ENTERPRISE PRO ERP` desde el acceso directo.
2. Usuario inicial: `admin`, contraseña: `Admin1234!`.
3. La aplicación exige cambiar la contraseña antes de habilitar cualquier otro módulo.
4. Configurar empresa, RNC/cédula, ITBIS, NCF y preferencias desde **Configuración**.

La moneda operativa es DOP/RD$. Los libros 606/607 y el aviso DGII están preparados como
estructura local; **esto no significa certificación DGII ni emisión de e-CF**.

## 3. Datos y respaldos

| Elemento | Ubicación |
|---|---|
| Base de datos | `%APPDATA%\enterprise-pro-erp\data\enterprise.db` |
| Preferencias | `%APPDATA%\enterprise-pro-erp\settings.json` |
| Respaldos | `%APPDATA%\enterprise-pro-erp\backups\` (configurable desde la UI) |
| Marcador de restauración | `%APPDATA%\enterprise-pro-erp\restore-pending.json` |
| Programa | `%LOCALAPPDATA%\Programs\ENTERPRISE PRO ERP` por defecto |

Los datos **no** se guardan junto al ejecutable, por lo que una reinstalación o actualización
no los toca. Dentro de la app, **Respaldos** permite crear copias íntegras con
`integrity_check`, verificarlas, programarlas y restaurar con doble confirmación. La
restauración aplica el reemplazo antes de abrir SQLite y reinicia la aplicación; por eso no
se debe copiar un archivo sobre la base de datos mientras la app está abierta.

Se recomienda, antes de actualizar o restaurar:

1. Crear un respaldo manual desde **Respaldos** y verificarlo.
2. Cerrar completamente la aplicación.
3. Conservar una copia externa de `%APPDATA%\enterprise-pro-erp\backups`.

## 4. Actualización

Ejecutar el instalador nuevo sobre la instalación existente. NSIS detecta la instalación
prev y realiza una actualización: las opciones Sí/No del desinstalador **no aparecen** en ese
caso, de modo que la base de datos, los respaldos y las preferencias se conservan.

Si se instaló en una carpeta distinta, usar el mismo `/D=ruta` para mantener los accesos
directos donde estaban.

Además de esa actualización manual, **Acerca de → Actualizaciones** permite **Buscar**,
**Descargar** e **Instalar y reiniciar** usando `electron-updater`. La fuente es
`ERP_UPDATE_URL` o, si no se define, el `build.publish.url` incluido en el paquete. El feed
incluido en esta entrega es local y sirve solo para pruebas; en producción debe publicarse en
HTTPS. Después de actualizar, iniciar sesión y pulsar **Acerca de** para confirmar versión y
directorio de datos.

## 5. Desinstalación

El desinstalador de Windows (o `Uninstall ENTERPRISE PRO ERP.exe` en la carpeta de
instalación) muestra primero una pantalla de bienvenida y luego pregunta:

> ¿Desea eliminar también los datos locales de ENTERPRISE PRO ERP?
> Esto incluye la base de datos, los respaldos y las preferencias guardados en
> `%APPDATA%\enterprise-pro-erp`. Si selecciona No, conservará toda su información.

- **No** (predeterminado): conserva íntegramente `%APPDATA%\enterprise-pro-erp`. Es la opción
  correcta si piensa reinstalar.
- **Sí**: elimina solo ese directorio de datos, además del programa y sus accesos directos.
  Esta acción no se puede deshacer sin un respaldo externo.

En desinstalación silenciosa (`/S`) se aplica la respuesta predeterminada **No**, por
seguridad. Las actualizaciones nunca muestran la pregunta.

## 6. Verificación realizada

| Comprobación | Resultado |
|---|---|
| `npm.cmd run typecheck` / `npm.cmd test` / `npm.cmd run build` | Limpios; 190/190 pruebas en 29 archivos. |
| `npm.cmd run test:e2e` / `npm.cmd run test:updater` | 4/4 pruebas E2E; feed local detectó 0.2.1. |
| `npm.cmd run dist:win` | NSIS x64 generado con `app.asar`, módulo nativo desempaquetado, icono y desinstalador. |
| Instalación silenciosa y arranque del exe instalado | Electron 37.10.3, Node 22.21.1, BD creada, `integrity_check` = `ok`, versión 0.2.0, sin exponer token y sin errores de consola propios. Evidencia: `C:\Users\ferre\AppData\Local\Temp\opencode\cdp-fase12-result.json`. |
| Respuesta **No** al desinstalar | Un centinela en el directorio de datos permaneció intacto. |
| Respuesta **Sí** al desinstalar | El mismo centinela fue eliminado; los datos reales de pruebas permanecieron presentes. Evidencia: `C:\Users\ferre\AppData\Local\Temp\opencode\desinstalacion-fase12-result.json`. |

Nota: la sonda inicial `auth.me` sin token aparece una vez en la consola de Electron y es
manejada por la UI como "sesión no iniciada"; se separó del resto de errores en la evidencia.

## 7. Mantenimiento y límites

- Para cambiar la carpeta de respaldos o la retención, usar **Configuración → Respaldos**.
  Los parámetros `backup_*` están protegidos contra cambios directos por IPC.
- Si aparece `PASSWORD_CHANGE_REQUIRED`, completar el cambio de contraseña; el router IPC
  bloquea el resto de canales hasta que termine.
- La actualización automática y la firma autofirmada se añadieron después de la Fase 12;
  véanse las secciones 4 y [docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md).
- `npm.cmd audit --omit=dev` reporta **0 vulnerabilidades de producción**. Los 11 avisos
  restantes son de desarrollo y exigen cambios mayores no autorizados.
- Decisiones técnicas: [ADR-0003](adr/0003-instalador-nsis.md) y
  [ADR-0004](adr/0004-cierre-limitaciones.md).
