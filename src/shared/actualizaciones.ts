/**
 * Feed público de electron-updater (proveedor `generic`). Se define en código porque
 * electron-builder elimina el campo `build` del package.json empaquetado.
 * `ERP_UPDATE_URL` permite sustituirlo en instalaciones corporativas o de prueba.
 */
export const URL_FEED_PUBLICADO = 'https://github.com/JOSEPHTVD0/enterprise-pro-erp/releases/latest/download/'

/** Progreso de la descarga, normalizado para el renderer. */
export interface ProgresoDescarga {
  porcentaje: number
  transferido: number
  total: number
  velocidad?: number
}

/** Estado expuesto por el servicio de actualizaciones del proceso principal. */
export interface EstadoActualizacion {
  habilitada: boolean
  versionActual: string
  verificando: boolean
  /** True cuando hubo una comprobación correcta, incluso si no hay versión nueva. */
  verificado: boolean
  disponible: boolean
  version?: string
  notas?: string
  descargada: boolean
  archivos?: number
  /** Ruta absoluta del instalador guardado en Descargas. */
  rutaInstalador?: string
  error?: string
}

export type ServicioActualizaciones = {
  estado: () => EstadoActualizacion
  verificar: () => Promise<EstadoActualizacion>
  descargar: () => Promise<EstadoActualizacion>
  abrirCarpeta: () => void
}
