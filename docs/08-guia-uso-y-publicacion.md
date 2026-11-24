# Guía de uso, compilación y publicación — ENTERPRISE PRO ERP 0.2.0

Esta guía complementa [docs/06-entrega-final.md](06-entrega-final.md) y
[docs/07-cierre-limitaciones.md](07-cierre-limitaciones.md). Está escrita para el usuario final
que instala el ERP y para el mantenedor que quiere reconstruirlo o publicarlo en GitHub.

---

## 1. Instalación (usuario final)

### Requisitos
- Windows 10 u 11, **64 bits**.
- No se necesita Node.js, Python ni instalar dependencias: el instalador incluye Electron,
  React compilado y SQLite.
- Espacio libre aproximado: 400 MB durante la instalación.

### Obtener e instalar
1. Descargar `EnterpriseProERP-Setup-0.2.0.exe` desde la sección *Releases* de este repositorio.
2. Comprobar el hash (opcional pero recomendado):

   ```powershell
   Get-FileHash .\EnterpriseProERP-Setup-0.2.0.exe -Algorithm SHA256
   ```

   Valor esperado: `DBAA5D31DCBD3C17D5B62094F649CF57ACF155D047DF9DAD2992D6B86746728F`.

3. Ejecutar el instalador. Es NSIS **por usuario**: no pide permisos de administrador.
   Se puede cambiar la carpeta de destino en el asistente.
4. Si Windows muestra SmartScreen, es **esperado**: el instalador está firmado con un
   certificado *autofirmado*. Solo un certificado de una CA pública elimina esa advertencia.
   No afecta el funcionamiento local.

### Instalación silenciosa (despliegue)
```powershell
.\EnterpriseProERP-Setup-0.2.0.exe /S /ND /NM /D=C:\ERP\EnterprisePro
```
- `/S`: sin interfaz.
- `/ND`: sin acceso directo de escritorio.
- `/NM`: sin acceso directo en el menú.
- `/D=ruta`: carpeta de instalación (debe ir al final).

---

## 2. Primer arranque

1. Abrir **ENTERPRISE PRO ERP** desde el acceso directo.
2. Usuario inicial: `admin` · Contraseña: `Admin1234!`.
3. El sistema exige **cambiar la contraseña** antes de habilitar cualquier otro módulo.
4. En **Configuración** registrar empresa, RNC/cédula, ITBIS, NCF y preferencias.

> Nota: al iniciar se emite una sonda interna `auth.me` sin token. La interfaz la interpreta como
> “sesión no iniciada”; no es un error de aplicación.

### Datos y respaldos
| Concepto | Ruta |
|---|---|
| Base de datos | `%APPDATA%\enterprise-pro-erp\data\enterprise.db` |
| Preferencias | `%APPDATA%\enterprise-pro-erp\settings.json` |
| Respaldos | `%APPDATA%\enterprise-pro-erp\backups\` |
| Programa | `%LOCALAPPDATA%\Programs\ENTERPRISE PRO ERP` (por defecto) |

Los datos **no** están dentro de la carpeta del programa: reinstalar o actualizar no los borra.

---

## 3. Guía funcional rápida

| Módulo | Acción recomendada |
|---|---|
| **Configuración** | Registrar empresa, RNC/cédula, ITBIS y series NCF antes de facturar. |
| **Clientes / Proveedores / Productos** | Alta desde *Maestros*. Importar productos con Excel desde el módulo de inventario. |
| **Inventario** | Registrar existencias; movimientos, series/lotes, ajustes y transferencias quedan en kardex. |
| **Ventas / POS** | Crear factura o cotización, seleccionar cliente y productos, aplicar ITBIS, guardar e imprimir. |
| **Compras** | Registrar compra, recepción y NCF del proveedor (el ERP nunca lo genera). |
| **Finanzas** | CxC, CxP, bancos, cajas y gastos; los cobros/pagos se reflejan en saldos y auditoría. |
| **Reportes** | Consultar indicadores, libros 606/607, exportar Excel/CSV e imprimir o guardar PDF. |
| **Auditoría** | Filtrar eventos por usuario, fecha y tipo; los cambios sensibles quedan registrados. |
| **Respaldos** | Copia manual, programador y restauración con doble confirmación. |

### Impresión y PDF
- **Imprimir** usa el diálogo nativo de Electron (`window.print()`) y CSS `@media print`.
- **Guardar PDF** genera un archivo real con pdfmake en el proceso principal. Está disponible en
  Facturación, Cotizaciones, POS, Compras, CxC, CxP, Bancos, Cajas y Reportes.
- Formatos: carta, media página, ticket 80 mm y ticket 58 mm.
- El PDF no acepta datos del renderer: el servicio vuelve a consultar la base de datos y
  comprueba permisos antes de generarlo.

### Actualizaciones
En **Acerca de → Actualizaciones**:
1. **Buscar** consulta el feed (`ERP_UPDATE_URL` o `build.publish.url`).
2. **Descargar** obtiene el instalador sin instalar automáticamente.
3. **Instalar y reiniciar** aplica la actualización y reinicia la app.

La actualización manual sigue disponible: ejecutar el instalador nuevo sobre la instalación
existente; los datos se conservan y el desinstalador no pregunta por ellos en ese caso.

### Desinstalación
El desinstalador pregunta: “¿Desea eliminar también los datos locales…?”.
- **No** → conserva base de datos, respaldos y preferencias.
- **Sí** → elimina `%APPDATA%\enterprise-pro-erp`.
- Instalación silenciosa (`/S`) → conserva los datos por defecto.

---

## 4. Compilación desde el código fuente

Requisitos: **Node.js 24.x**, npm 11.x, Windows 10/11 x64.

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dist:win
npm.cmd run release:feed
npm.cmd run release:serve
```

| Script | Qué hace |
|---|---|
| `npm.cmd run typecheck` | TypeScript estricto (`tsc --noEmit`). |
| `npm.cmd test` | 190 pruebas unitarias y de integración sobre SQLite real. |
| `npm.cmd run test:e2e` | 4 pruebas E2E con Playwright conectado por CDP a Electron. |
| `npm.cmd run test:updater` | Levanta un feed efímero y verifica que `electron-updater` detecte `0.2.1`. |
| `npm.cmd run dist:win` | Compila y genera el NSIS x64. Usa `scripts/dist-win.mjs` + `compat-execfile.cjs`. |
| `npm.cmd run release:feed` | Copia el instalador a `release\`, calcula SHA-512 y escribe `latest.yml`. |
| `npm.cmd run release:serve` | Sirve `release\` en `http://127.0.0.1:8080/` solo para pruebas. |
| `npm.cmd run release:win` | Atajo: `dist:win` + `release:feed`. |

### Firma del instalador
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\firmar-instalador.ps1
```
- Crea `build\certs\enterprise-pro-erp-selfsigned.pfx` (ignorado por Git) si no existe.
- Usa el `signtool.exe` incluido en `@electron/windows-sign`.
- Si no hay acceso al servidor de tiempo, firma **sin timestamp**.
- Vuelve a ejecutar `npm.cmd run release:feed` después de firmar para que el SHA-512 coincida.

### Compatibilidad de electron-builder con Node 24
`dist:win` no llama directamente a `electron-builder`, sino a `scripts/dist-win.mjs`. Este script
precarga `scripts/compat-execfile.cjs` con `NODE_OPTIONS=--require`: electron-builder 26 ejecuta
el stub del desinstalador con un entorno que solo contiene `__COMPAT_LAYER`, y Node 24 responde
`spawn UNKNOWN` por falta de `SystemRoot`. El shim fusiona ese entorno con el del proceso.
No modifica dependencias ni cambia el instalador.

---

## 5. Publicación en GitHub

El repositorio se publica con un único commit inicial. Si vas a republicar desde cero:

```powershell
# 1. Verificar que no queden artefactos generados
git status --short          # debe estar vacío

# 2. Añadir el remoto y subir el commit
git remote add origin https://github.com/<USUARIO>/enterprise-pro-erp.git
git branch -M main
git push -u origin main

# 3. Comprobar
git log -1 --format="%H"
git status --short
```

Si usas la CLI de GitHub (`gh`) autenticada:

```powershell
gh auth status
gh repo create enterprise-pro-erp --public --source=. --remote=origin --push
```

Para publicar el instalador como *Release* (el binario no se versiona en Git):

```powershell
gh release create v0.2.0 `
  dist\EnterpriseProERP-Setup-0.2.0.exe `
  release\latest.yml `
  --title "ENTERPRISE PRO ERP 0.2.0" `
  --notes-file docs\06-entrega-final.md
```

> Antes de publicar una versión nueva, actualiza el hash en `README.md`, `docs/05` y `docs/06`,
> firma el instalador y regenera `latest.yml`.

---

## 6. Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| SmartScreen al instalar | Firma autofirmada. Se requiere certificado de CA pública para eliminarlo. |
| “No hay actualizaciones” | El feed por defecto es local. Publicar `latest.yml` en HTTPS y definir `ERP_UPDATE_URL`. |
| `spawn UNKNOWN` al compilar | Usar `npm.cmd run dist:win` (aplica el shim de compatibilidad). |
| La app no inicia | Verificar que `better-sqlite3` quedó desempaquetado (`asarUnpack`) y que no haya otra instancia abierta. |
| Olvidé la contraseña | No hay recuperación automática: usar un respaldo de la BD o reiniciar con el usuario semilla en un perfil nuevo. |
| Error de permisos | Cada módulo verifica permisos en backend; revisar roles en *Usuarios*. |

---

## 7. Límites y avisos legales

- **No se afirma certificación DGII ni emisión de e-CF.** Solo hay preparación arquitectónica,
  NCF y libros 606/607 derivados de documentos reales.
- **SmartScreen permanece** mientras se use el certificado autofirmado.
- **Auditoría:** 0 vulnerabilidades de producción; 11 avisos de desarrollo que requieren
  actualizaciones mayores no autorizadas (Electron 45, Vitest 5, electron-builder 25).
- Cual cambio de esquema, BD, dependencias mayores o flujos financieros requiere autorización previa.
