import { ZodError } from 'zod'

export { encodeIpcError, decodeIpcError } from './ipc-error'

/** Error de dominio: se serializa por IPC y se muestra como notificación. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Señala al renderer que debe mostrar el selector de empresa antes de continuar. */
export class SelectCompanyError extends DomainError {
  constructor(public readonly empresas: { id: number; nombre: string }[]) {
    super('SELECT_COMPANY', 'Seleccione la empresa con la que desea trabajar.')
    this.name = 'SelectCompanyError'
  }
}

export const errors = {
  forbidden: () => new DomainError('FORBIDDEN', 'No tiene permiso para realizar esta operación.'),
  unauthorized: () => new DomainError('UNAUTHORIZED', 'Sesión no válida o expirada. Inicie sesión nuevamente.'),
  notFound: (what: string) => new DomainError('NOT_FOUND', `${what} no encontrado.`),
  validation: (msg: string) => new DomainError('VALIDATION', msg),
  conflict: (msg: string) => new DomainError('CONFLICT', msg)
}

/** Convierte cualquier error lanzado en un objeto seguro para enviar al renderer. */
export function serializeError(error: unknown): { code: string; message: string; data?: unknown } {
  if (error instanceof ZodError) {
    const first = error.issues[0]
    const campo = first?.path.join('.')
    return {
      code: 'VALIDATION',
      message: campo ? `Dato inválido en ${campo}: ${first.message}` : `Dato inválido: ${first?.message ?? 'revisar el formulario'}`
    }
  }
  if (error instanceof DomainError) {
    const data = error instanceof SelectCompanyError ? error.empresas : error.data
    return data === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, data }
  }
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    if (error.code.startsWith('SQLITE_CONSTRAINT')) {
      return { code: 'CONFLICT', message: 'El registro ya existe o viola una restricción de integridad.' }
    }
    return { code: error.code, message: String((error as { message?: unknown }).message ?? 'Error desconocido') }
  }
  return { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Error interno del sistema.' }
}
