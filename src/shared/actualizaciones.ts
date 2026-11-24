/** Estado expuesto por el servicio de actualizaciones del proceso principal. */
export interface EstadoActualizacion {
  habilitada: boolean
  versionActual: string
  verificando: boolean
  disponible: boolean
  version?: string
  notas?: string
  descargada: boolean
  archivos?: number
  error?: string
}

export type ServicioActualizaciones = {
  estado: () => EstadoActualizacion
  verificar: () => Promise<EstadoActualizacion>
  descargar: () => Promise<EstadoActualizacion>
  instalar: () => void
}
