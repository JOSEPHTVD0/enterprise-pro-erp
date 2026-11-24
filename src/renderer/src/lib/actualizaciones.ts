import type { EstadoActualizacion } from '@shared/actualizaciones'

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

export function instalarActualizacion(): void {
  void window.api.invoke<void>('update.instalar')
}
