import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ARCHIVO = 'instancia-lider.json'
const TTL_MS = 45_000
const LATIDO_MS = 15_000

export interface LideratoInstancia {
  esLider: boolean
  detener: () => void
}

interface DatosLider {
  id: string
  actualizado: number
}

function leer(ruta: string): DatosLider | null {
  try {
    const datos = JSON.parse(readFileSync(ruta, 'utf-8')) as Partial<DatosLider>
    return typeof datos.id === 'string' && Number.isFinite(datos.actualizado)
      ? { id: datos.id, actualizado: Number(datos.actualizado) }
      : null
  } catch {
    return null
  }
}

/**
 * Elección de líder por archivo con latido. No bloquea el arranque: todas las
 * instancias abren la BD; solo una ejecuta respaldos, VACUUM, exportaciones,
 * restauración y la búsqueda inicial de actualizaciones.
 *
 * Si el líder se cierra de forma limpia libera el archivo. Si muere, otra
 * instancia lo reclama cuando el latido supera `TTL_MS`.
 */
export function adquirirLiderInstancia(
  userDataPath: string,
  ahora: () => number = Date.now
): LideratoInstancia {
  mkdirSync(userDataPath, { recursive: true })
  const ruta = join(userDataPath, ARCHIVO)
  const id = `${process.pid}-${ahora()}-${Math.random().toString(36).slice(2)}`

  const escribir = (contenido: string): void => {
    const descriptor = openSync(ruta, 'w')
    try {
      writeFileSync(descriptor, contenido, 'utf-8')
    } finally {
      closeSync(descriptor)
    }
  }

  const intentar = (): boolean => {
    try {
      const descriptor = openSync(ruta, 'wx')
      try {
        writeFileSync(descriptor, JSON.stringify({ id, actualizado: ahora() }), 'utf-8')
      } finally {
        closeSync(descriptor)
      }
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false
      const actual = leer(ruta)
      if (actual && ahora() - actual.actualizado <= TTL_MS) return false
      try {
        rmSync(ruta, { force: true })
      } catch {
        return false
      }
      return intentar()
    }
  }

  if (!intentar()) return { esLider: false, detener: () => {} }

  const temporizador = setInterval(() => {
    const actual = leer(ruta)
    // No sobrescribir un latido ajeno si perdimos el archivo.
    if (!actual || actual.id === id) {
      escribir(JSON.stringify({ id, actualizado: ahora() }))
    }
  }, LATIDO_MS)
  temporizador.unref?.()

  return {
    esLider: true,
    detener: () => {
      clearInterval(temporizador)
      if (leer(ruta)?.id === id) rmSync(ruta, { force: true })
    }
  }
}
