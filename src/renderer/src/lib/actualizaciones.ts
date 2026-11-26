import type { EstadoActualizacion, ProgresoDescarga } from '@shared/actualizaciones'

/** Los canales `update.*` están protegidos por `isTrusted` en el proceso principal. */
export function estadoActualizaciones(): Promise<EstadoActualizacion> {
  return window.api.invoke<EstadoActualizacion>('update.estado')
}

export function verificarActualizaciones(): Promise<EstadoActualizacion> {
  return window.api.invoke<EstadoActualizacion>('update.verificar')
}

export function descargarActualizacion(): Promise<EstadoActualizacion> {
  return window.api.invoke<EstadoActualizacion>('update.descargar')
}

/** Abre el explorador en el instalador guardado; la instalación sigue siendo manual. */
export function abrirCarpetaInstalador(): Promise<void> {
  return window.api.invoke<void>('update.abrirCarpeta')
}

/** El proceso principal empuja el estado y el progreso; el sondeo queda como respaldo. */
export function suscribirEstadoActualizacion(
  callback: (estado: EstadoActualizacion) => void
): () => void {
  return window.api.onEstadoActualizacion(callback)
}

export function suscribirProgresoDescarga(
  callback: (progreso: ProgresoDescarga) => void
): () => void {
  return window.api.onProgresoDescarga(callback)
}
