import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadSettings, saveSettings } from './settings'
import { resolveTheme } from '../shared/settings'
import { initializeDatabase, closeDatabase } from './db/connection'
import { registerIpc } from './ipc/router'
import {
  consumirRestauracionPendiente, registrarRestauracionAuditoria, iniciarBackupScheduler
} from './services/backups.service'
import type { MarcadorRestauracion } from './services/backups.service'
import { crearServicioActualizaciones, registrarIpcActualizaciones } from './services/updater.service'

let mainWindow: BrowserWindow | null = null
let detenerScheduler: () => void = () => {}

/** Instancia única: evita dos procesos escribiendo la misma configuración/BD. */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

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

  // Bloquear navegación externa y nuevas ventanas: aplicación 100 % local.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!devUrl || !mainWindow?.webContents.getURL().startsWith(devUrl)) {
      event.preventDefault()
    }
  })

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

function registerBasicIpc(): void {
  ipcMain.handle('settings:get', (event) => {
    if (!isTrusted(event)) throw new Error('Origen IPC no autorizado')
    return loadSettings()
  })

  ipcMain.handle('settings:set', (event, payload: unknown) => {
    if (!isTrusted(event)) throw new Error('Origen IPC no autorizado')
    return saveSettings(payload)
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

/** `ERP_UPDATE_URL` manda; si no está, se usa el `build.publish.url` del paquete. */
function urlFeedPublicado(): string {
  try {
    const paquete = JSON.parse(
      readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
    ) as { build?: { publish?: { url?: string } } }
    return paquete.build?.publish?.url ?? ''
  } catch {
    return ''
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.enterprisepro.erp')
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'data', 'enterprise.db')

  // La restauración se aplica antes de abrir SQLite: nunca se copia sobre una BD abierta.
  let restaurado: MarcadorRestauracion | null = null
  try {
    restaurado = consumirRestauracionPendiente(userDataPath, dbPath)
  } catch (error) {
    console.error('[backups] No se pudo aplicar la restauración pendiente:', error)
  }
  const db = initializeDatabase()
  if (restaurado) registrarRestauracionAuditoria(db, restaurado)
  detenerScheduler = iniciarBackupScheduler({ db, userDataPath, dbPath })
  registerBasicIpc()
  const actualizaciones = crearServicioActualizaciones(
    autoUpdater, process.env['ERP_UPDATE_URL'] ?? urlFeedPublicado(), app.getVersion()
  )
  registrarIpcActualizaciones(ipcMain, isTrusted, actualizaciones)
  registerIpc(db, isTrusted)
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
  closeDatabase()
})
