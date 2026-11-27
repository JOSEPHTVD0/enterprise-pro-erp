import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { access, copyFile, mkdir } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { URL_FEED_PUBLICADO, type EstadoActualizacion, type ProgresoDescarga } from '@shared/actualizaciones'
import type { Settings } from '@shared/settings'
import { verificarFirmaInstalador } from './firma-instalador'

/** Preferencias de estación que gobiernan el comportamiento del actualizador. */
export interface OpcionesActualizaciones {
  canal?: Settings['actualizaciones']['canal']
  descargaAutomatica?: boolean
  notificarVersiones?: boolean
  buscarAlIniciar?: boolean
}

/** Destino local del instalador y forma de mostrarlo al usuario. */
export interface AlmacenamientoActualizacion {
  carpeta: string
  mostrarArchivo: (ruta: string) => void
}

/** Traduce `settings.actualizaciones` sin tocar el feed ni el contrato `latest.yml`. */
export function opcionesDeSettings(
  actualizaciones: Settings['actualizaciones']
): OpcionesActualizaciones {
  return {
    canal: actualizaciones.canal,
    descargaAutomatica: actualizaciones.descargaAutomatica,
    notificarVersiones: actualizaciones.notificarVersiones,
    buscarAlIniciar: actualizaciones.buscarAlIniciar
  }
}

/**
 * `ESTABLE` descarta etiquetas beta (`0.6.0-beta.1`, `v0.6.0-BETA`, ...);
 * `BETA` las acepta junto con las estables. La comparación es solo de etiqueta,
 * nunca de URL: el feed sigue siendo el mismo para ambos canales.
 */
export function esVersionDelCanal(
  version: string | undefined,
  canal: Settings['actualizaciones']['canal'] = 'ESTABLE'
): boolean {
  if (!version) return false
  return canal === 'BETA' || !/beta/i.test(version)
}

/** La verificación de arranque sigue siendo diferida, no bloqueante y solo en app instalada. */
export function debeBuscarAlIniciar(
  actualizaciones: Settings['actualizaciones'],
  packaged: boolean
): boolean {
  return actualizaciones.buscarAlIniciar && packaged
}

export function debeNotificarVersiones(opciones: OpcionesActualizaciones): boolean {
  return opciones.notificarVersiones !== false
}

/** Fuente efectiva: variable de entorno o feed público incluido en el código. */
export function urlFeedActualizacion(): string {
  return process.env['ERP_UPDATE_URL']?.trim() || URL_FEED_PUBLICADO
}

/** Datos tal como los emite electron-updater en `download-progress`. */
export interface ProgresoDescargaCrudo {
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}

/** Contrato mínimo para poder probar el servicio sin descargar nada. */
export interface ActualizadorLike {
  autoDownload: boolean
  /** Siempre se fuerza a `false`: el usuario instala manualmente el archivo guardado. */
  autoInstallOnAppQuit: boolean
  /** Requerido por electron-updater para permitir pruebas sin empaquetar. */
  forceDevUpdateConfig?: boolean
  /** Verificación de firma sustituida por la nuestra, fijada a nuestro certificado. */
  verifyUpdateCodeSignature?: (
    nombresPublicador: string[],
    rutaInstalador: string
  ) => Promise<string | null> | string | null
  /** `autoUpdater` es un EventEmitter; en pruebas puede omitirse. */
  on?: (evento: 'download-progress', oyente: (progreso: ProgresoDescargaCrudo) => void) => void
  off?: (evento: 'download-progress', oyente: (progreso: ProgresoDescargaCrudo) => void) => void
  setFeedURL(opciones: { provider: 'generic'; url: string }): void
  checkForUpdates(): Promise<{ updateInfo?: { version?: string; releaseNotes?: unknown } | null } | null>
  downloadUpdate(): Promise<string[]>
}

/** Puente opcional para avisar al renderer sin acoplar el servicio a BrowserWindow. */
export interface NotificadorActualizaciones {
  estado?: (estado: EstadoActualizacion) => void
  progreso?: (progreso: ProgresoDescarga) => void
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizarProgreso(datos: ProgresoDescargaCrudo): ProgresoDescarga {
  const total = Number(datos.total ?? 0) || 0
  const transferido = Number(datos.transferred ?? 0) || 0
  const porcentajeInformado = Number(datos.percent ?? Number.NaN)
  const porcentaje = Number.isFinite(porcentajeInformado)
    ? porcentajeInformado
    : total > 0 ? (transferido / total) * 100 : 0
  const velocidad = Number(datos.bytesPerSecond ?? 0) || undefined
  return {
    porcentaje: Math.max(0, Math.min(100, Math.round(porcentaje))),
    transferido,
    total,
    velocidad
  }
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta)
    return true
  } catch {
    return false
  }
}

/** Usa solo el componente final, con separadores de Windows y POSIX. */
function nombreDelInstalador(ruta: string, version: string): string {
  const nombre = ruta.split(/[\\/]/).pop()?.replace(/^temp-/, '') || ''
  const conExtension = /\.exe$/i.test(nombre) ? nombre : `${nombre || `EnterpriseProERP-Setup-${version}`}.exe`
  return conExtension.replace(/[<>:"|?*]/g, '_')
}

/** Nunca sobrescribe un instalador previo: añade un sufijo si ya existe. */
async function guardarInstalador(
  origen: string,
  carpeta: string,
  version: string
): Promise<string> {
  await mkdir(carpeta, { recursive: true })
  const nombre = nombreDelInstalador(origen, version)
  const extension = extname(nombre)
  const raiz = nombre.slice(0, nombre.length - extension.length)
  let destino = join(carpeta, nombre)
  let sufijo = 1
  while (await existe(destino)) {
    destino = join(carpeta, `${raiz}-${sufijo}${extension}`)
    sufijo += 1
  }
  await copyFile(origen, destino)
  return destino
}

function estaDentroDe(ruta: string, carpeta: string): boolean {
  const raiz = resolve(carpeta)
  const prefijo = raiz.endsWith(sep) ? raiz : `${raiz}${sep}`
  return resolve(ruta).toLowerCase().startsWith(prefijo.toLowerCase())
}

export function crearServicioActualizaciones(
  actualizador: ActualizadorLike,
  urlFeed: string,
  versionActual: string,
  notificador: NotificadorActualizaciones = {},
  opcionesIniciales: OpcionesActualizaciones = {},
  almacenamiento: AlmacenamientoActualizacion
): {
  estado: () => EstadoActualizacion
  verificar: () => Promise<EstadoActualizacion>
  descargar: () => Promise<EstadoActualizacion>
  abrirCarpeta: () => void
  configurarOpciones: (opciones: OpcionesActualizaciones) => void
} {
  const habilitada = urlFeed.trim().length > 0
  let opciones: OpcionesActualizaciones = { canal: 'ESTABLE', notificarVersiones: true, ...opcionesIniciales }
  let estado: EstadoActualizacion = {
    habilitada, versionActual, verificando: false, verificado: false,
    actualizado: false, disponible: false, descargada: false
  }
  let ultimoProgreso: ProgresoDescarga = { porcentaje: 0, transferido: 0, total: 0 }
  let ultimoTotal = 0

  if (habilitada) {
    actualizador.autoDownload = false
    actualizador.autoInstallOnAppQuit = false
    actualizador.forceDevUpdateConfig = true
    // El certificado es autofirmado: la validación por defecto de Windows
    // rechazaría el instalador aunque el SHA-512 del feed sea correcto.
    if (actualizador.verifyUpdateCodeSignature) {
      actualizador.verifyUpdateCodeSignature = (nombres, ruta) =>
        verificarFirmaInstalador(nombres, ruta)
    }
    actualizador.setFeedURL({ provider: 'generic', url: urlFeed.trim() })
    actualizador.on?.('download-progress', (datos) => emitirProgreso(normalizarProgreso(datos)))
  }

  const cambiar = (parcial: Partial<EstadoActualizacion>): EstadoActualizacion => {
    estado = { ...estado, ...parcial }
    // `notificarVersiones` es una política de la estación: controla los eventos
    // hacia el renderer. El estado interno sigue disponible por IPC (`update.estado`).
    if (debeNotificarVersiones(opciones)) notificador.estado?.(estado)
    return estado
  }

  function emitirProgreso(progreso: ProgresoDescarga): void {
    ultimoProgreso = progreso
    if (progreso.total > 0) ultimoTotal = progreso.total
    if (debeNotificarVersiones(opciones)) notificador.progreso?.(progreso)
  }

  async function descargar(): Promise<EstadoActualizacion> {
    if (!estado.disponible) {
      throw new Error(estado.actualizado
        ? `La aplicación está actualizada (${estado.versionActual}). No hay nada que descargar.`
        : 'No hay una actualización disponible para descargar.')
    }
    const totalPrevio = ultimoProgreso.total || ultimoTotal
    emitirProgreso({ porcentaje: 0, transferido: 0, total: totalPrevio })
    cambiar({
      descargada: false, archivos: undefined, rutaInstalador: undefined, error: undefined
    })
    try {
      const archivos = await actualizador.downloadUpdate()
      const origen = archivos[0]
      if (!origen) throw new Error('El actualizador no devolvió la ruta del instalador.')
      const rutaInstalador = await guardarInstalador(
        origen, almacenamiento.carpeta, estado.version ?? versionActual
      )
      const total = ultimoProgreso.total || ultimoTotal || ultimoProgreso.transferido
      emitirProgreso({ ...ultimoProgreso, porcentaje: 100, transferido: total, total })
      return cambiar({
        descargada: true,
        archivos: archivos.length,
        rutaInstalador,
        error: undefined
      })
    } catch (error) {
      emitirProgreso({ ...ultimoProgreso, porcentaje: 0 })
      return cambiar({
        error: mensaje(error), descargada: false, rutaInstalador: undefined
      })
    }
  }

  function abrirCarpeta(): void {
    const ruta = estado.rutaInstalador
    if (!ruta) throw new Error('Descargue el instalador antes de abrir la carpeta.')
    if (!estaDentroDe(ruta, almacenamiento.carpeta)) {
      throw new Error('Ruta del instalador no autorizada.')
    }
    almacenamiento.mostrarArchivo(ruta)
  }

  return {
    estado: () => estado,

    async verificar() {
      if (!habilitada) {
        return cambiar({ error: 'Fuente de actualizaciones no configurada.' })
      }
      cambiar({ verificando: true, actualizado: false, error: undefined })
      try {
        const resultado = await actualizador.checkForUpdates()
        const info = resultado?.updateInfo
        const version = info?.version
        const sinVersionNueva = !version ||
          version.replace(/^v/i, '') === versionActual.replace(/^v/i, '')
        const delCanal = !sinVersionNueva && esVersionDelCanal(version, opciones.canal ?? 'ESTABLE')
        const detectado = cambiar({
          verificando: false,
          verificado: true,
          actualizado: sinVersionNueva,
          disponible: delCanal,
          version: delCanal ? version : undefined,
          notas: delCanal && typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined,
          descargada: false,
          archivos: undefined,
          rutaInstalador: undefined
        })
        // La descarga automática guarda el instalador; nunca lo ejecuta.
        if (detectado.disponible && opciones.descargaAutomatica) return descargar()
        return detectado
      } catch (error) {
        return cambiar({
          verificando: false,
          verificado: false,
          actualizado: false,
          error: mensaje(error),
          disponible: false,
          descargada: false,
          version: undefined,
          notas: undefined,
          archivos: undefined,
          rutaInstalador: undefined
        })
      }
    },

    descargar,
    abrirCarpeta,

    configurarOpciones(opcionesNuevas: OpcionesActualizaciones) {
      opciones = { canal: 'ESTABLE', notificarVersiones: true, ...opcionesNuevas }
    }
  }
}

/** Canales básicos: usan el mismo `isTrusted` que el resto del proceso principal. */
export function registrarIpcActualizaciones(
  ipcMain: IpcMain,
  esConfiable: (evento: IpcMainInvokeEvent) => boolean,
  servicio: ReturnType<typeof crearServicioActualizaciones>
): void {
  const proteger = <T>(evento: IpcMainInvokeEvent, accion: () => T): T => {
    if (!esConfiable(evento)) throw new Error('Origen IPC no autorizado')
    return accion()
  }

  ipcMain.handle('update.estado', (evento) => proteger(evento, () => servicio.estado()))
  ipcMain.handle('update.verificar', (evento) => proteger(evento, () => servicio.verificar()))
  ipcMain.handle('update.descargar', (evento) => proteger(evento, () => servicio.descargar()))
  ipcMain.handle('update.abrirCarpeta', (evento) => proteger(evento, () => servicio.abrirCarpeta()))
}
