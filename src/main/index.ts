import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadSettings, saveSettings } from './settings'
import { resolveTheme } from '../shared/settings'
import { initializeDatabase, closeDatabase, type Db } from './db/connection'
import { registerIpc } from './ipc/router'
import { buildContext } from './services/context'
import { libroHabilitado } from './services/configuracion.service'
import { errors } from '@shared/errors'
import {
  consumirRestauracionPendiente, registrarRestauracionAuditoria, iniciarBackupScheduler,
  iniciarVacuumScheduler
} from './services/backups.service'
import type { MarcadorRestauracion } from './services/backups.service'
import { procesarExportacionesAutomaticas } from './services/pdf.service'
import {
  crearServicioActualizaciones, registrarIpcActualizaciones, urlFeedActualizacion,
  opcionesDeSettings, debeBuscarAlIniciar, debeNotificarVersiones
} from './services/updater.service'
import { adquirirLiderInstancia } from './services/liderato.service'
import { registrarInstancia } from './services/instancias.service'

let mainWindow: BrowserWindow | null = null
let detenerScheduler: () => void = () => {}
let detenerVacuum: () => void = () => {}
let detenerExportaciones: () => void = () => {}
let detenerLiderato: () => void = () => {}
let detenerInstancia: () => void = () => {}
let actualizaciones: ReturnType<typeof crearServicioActualizaciones> | null = null

/**
 * Se permiten varias instancias con la misma base de datos. SQLite (WAL + FK +
 * `busy_timeout`) protege las escrituras; el liderazgo evita duplicar trabajos
 * globales (respaldos, VACUUM, exportaciones, restauración y verificación inicial).
 */

function createWindow(): void {
  const settings = loadSettings()
  const dark = resolveTheme(settings.theme, nativeTheme.shouldUseDarkColors) === 'dark'

  mainWindow = new BrowserWindow({
    title: 'ENTERPRISE PRO ERP',
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: dark ? '#0b1220' : '#f4f6fb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  const urlLocal = process.env['ELECTRON_RENDERER_URL'] ||
    pathToFileURL(join(__dirname, '../renderer/index.html')).href

  // Bloquear navegación externa y nuevas ventanas: aplicación 100 % local.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Permitir recargas de nuestra propia página (incluido el fallback del ErrorBoundary).
    if (!url.startsWith(urlLocal)) event.preventDefault()
  })

  // Recuperación ante renderer caído/cuelgue: sin esto, una ventana puede quedar
  // negra hasta cerrar y volver a abrir el proceso.
  let reintentos = 0
  const recuperar = (motivo: string): void => {
    if (reintentos >= 3) {
      console.error(`[renderer] ${motivo}. Se agotaron los reintentos de recarga.`)
      return
    }
    reintentos += 1
    console.error(`[renderer] ${motivo}. Recargando (${reintentos}/3)…`)
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.reload()
      }
    }, 300)
  }
  mainWindow.webContents.on('did-fail-load', (_evento, codigo, descripcion, esPrincipal) => {
    if (esPrincipal && codigo !== -3) recuperar(`falló la carga (${codigo}: ${descripcion})`)
  })
  mainWindow.webContents.on('render-process-gone', (_evento, detalles) => {
    if (detalles.reason !== 'clean-exit') recuperar(`proceso renderer terminado (${detalles.reason})`)
  })
  mainWindow.webContents.on('unresponsive', () => recuperar('renderer sin respuesta'))

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Solo la ventana principal puede invocar el API. */
function isTrusted(event: Electron.IpcMainInvokeEvent): boolean {
  return !!mainWindow && event.sender === mainWindow.webContents
}

/**
 * `reportes.service.ts` y `router.ts` no se modifican: se envuelven sus dos
 * canales durante el registro para que `ajustes.fiscal.libro606/libro607` también
 * gobierne la generación directa de esos libros, no solo su exportación PDF.
 * El contexto se resuelve desde el token real y se restaura `ipcMain.handle`
 * inmediatamente después de registrar el router.
 */
function registrarRouterConLibrosFiscales(
  db: Db,
  opciones: {
    instanciasActivas?: () => number
    webContents?: () => Electron.WebContents | null
  } = {}
): void {
  const original = ipcMain.handle
  const registrar = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((canal: string, oyente: (evento: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
    if (canal !== 'reportes.imprimir' && canal !== 'reportes.exportar') {
      return registrar(canal as never, oyente as never)
    }
    return registrar(canal as never, ((evento: Electron.IpcMainInvokeEvent, sobre: unknown) => {
      const entrada = (sobre as { input?: { reporte?: string } } | undefined)?.input
      const reporte = entrada?.reporte
      if (reporte === 'LIBRO606' || reporte === 'LIBRO607') {
        const token = (sobre as { token?: string } | undefined)?.token
        const ctx = token ? buildContext(db, token) : null
        if (!ctx || !libroHabilitado(db, ctx.empresaId, reporte)) {
          throw errors.validation(`El libro ${reporte} está desactivado en ajustes fiscales.`)
        }
      }
      return oyente(evento, sobre)
    }) as never)
  }) as typeof ipcMain.handle
  try {
    registerIpc(db, isTrusted, opciones)
  } finally {
    ipcMain.handle = original
  }
}

function registerBasicIpc(): void {
  ipcMain.handle('app:reload', (event) => {
    if (!isTrusted(event)) throw new Error('Origen IPC no autorizado')
    event.sender.reload()
  })

  ipcMain.handle('settings:get', (event) => {
    if (!isTrusted(event)) throw new Error('Origen IPC no autorizado')
    return loadSettings()
  })

  ipcMain.handle('settings:set', (event, payload: unknown) => {
    if (!isTrusted(event)) throw new Error('Origen IPC no autorizado')
    const guardadas = saveSettings(payload)
    // Los cambios de la estación surten efecto sin reiniciar: canal, descarga
    // automática y notificaciones se reevalúan en el proceso principal.
    actualizaciones?.configurarOpciones(opcionesDeSettings(guardadas.actualizaciones))
    return guardadas
  })

  ipcMain.handle('app:get-info', (event) => {
    if (!isTrusted(event)) throw new Error('Origen IPC no autorizado')
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      userDataPath: app.getPath('userData')
    }
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.enterprisepro.erp')
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'data', 'enterprise.db')
  const liderato = adquirirLiderInstancia(userDataPath)
  detenerLiderato = liderato.detener
  const registroInstancia = registrarInstancia(userDataPath)
  detenerInstancia = registroInstancia.detener

  // Solo el líder aplica restauraciones: reemplazar la BD con otras conexiones
  // abiertas podría destruir datos de las demás ventanas.
  let restaurado: MarcadorRestauracion | null = null
  if (liderato.esLider) {
    try {
      restaurado = consumirRestauracionPendiente(userDataPath, dbPath)
    } catch (error) {
      console.error('[backups] No se pudo aplicar la restauración pendiente:', error)
    }
  }
  const db = initializeDatabase()
  if (restaurado) registrarRestauracionAuditoria(db, restaurado)

  // Tareas globales: una sola instancia las ejecuta aunque haya varias ventanas.
  if (liderato.esLider) {
    detenerScheduler = iniciarBackupScheduler({ db, userDataPath, dbPath })
    detenerVacuum = iniciarVacuumScheduler(db)
    const temporizadorExportaciones = setInterval(() => {
      void procesarExportacionesAutomaticas(db, userDataPath).catch((error) => {
        console.error('[exportaciones] No se pudo procesar la cola automática:', error)
      })
    }, 5_000)
    temporizadorExportaciones.unref?.()
    detenerExportaciones = () => clearInterval(temporizadorExportaciones)
  }
  registerBasicIpc()
  const preferenciasActualizacion = opcionesDeSettings(loadSettings().actualizaciones)
  const carpetaDescargas = resolve(process.env['ERP_DOWNLOADS_DIR']?.trim() || app.getPath('downloads'))
  actualizaciones = crearServicioActualizaciones(
    autoUpdater, urlFeedActualizacion(), app.getVersion(), {
      estado: (estado) => {
        if (!debeNotificarVersiones(opcionesDeSettings(loadSettings().actualizaciones))) return
        for (const ventana of BrowserWindow.getAllWindows()) {
          if (!ventana.isDestroyed()) ventana.webContents.send('update.estado', estado)
        }
      },
      progreso: (progreso) => {
        if (!debeNotificarVersiones(opcionesDeSettings(loadSettings().actualizaciones))) return
        for (const ventana of BrowserWindow.getAllWindows()) {
          if (!ventana.isDestroyed()) ventana.webContents.send('update.progreso', progreso)
        }
      }
    },
    preferenciasActualizacion,
    {
      carpeta: carpetaDescargas,
      mostrarArchivo: (ruta) => shell.showItemInFolder(ruta)
    }
  )
  registrarIpcActualizaciones(ipcMain, isTrusted, actualizaciones)
  // `buscarAlIniciar` dispara una verificación diferida tras arrancar la ventana;
  // si además está activa `descargaAutomatica`, el servicio solo guarda el instalador.
  if (liderato.esLider && debeBuscarAlIniciar(loadSettings().actualizaciones, app.isPackaged)) {
    setTimeout(() => { void actualizaciones?.verificar().catch(() => undefined) }, 8_000).unref()
  }
  registrarRouterConLibrosFiscales(db, {
    instanciasActivas: registroInstancia.activas,
    webContents: () => mainWindow?.webContents ?? null
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  detenerScheduler()
  detenerVacuum()
  detenerExportaciones()
  detenerLiderato()
  detenerInstancia()
  closeDatabase()
})
