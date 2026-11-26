import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CARPETA = 'instancias'
const TTL_MS = 45_000
const LATIDO_MS = 15_000

interface Registro {
  id: string
  pid: number
  actualizado: number
}

export interface RegistroInstancias {
  /** Número de procesos vivos (latidos recientes), incluida esta instancia. */
  activas: () => number
  detener: () => void
}

/**
 * Registro de instancias por archivo con latido. Se usa para impedir una
 * restauración mientras otras ventanas/procesos tienen la BD abierta.
 */
export function registrarInstancia(
  userDataPath: string,
  ahora: () => number = Date.now
): RegistroInstancias {
  const directorio = join(userDataPath, CARPETA)
  mkdirSync(directorio, { recursive: true })
  const id = `${process.pid}-${ahora()}-${Math.random().toString(36).slice(2)}`
  const archivo = join(directorio, `${id}.json`)

  const escribir = (): void => {
    writeFileSync(archivo, JSON.stringify({ id, pid: process.pid, actualizado: ahora() }), 'utf-8')
  }
  escribir()
  const temporizador = setInterval(escribir, LATIDO_MS)
  temporizador.unref?.()

  const activas = (): number => {
    const momento = ahora()
    try {
      return readdirSync(directorio).reduce((total, nombre) => {
        if (!nombre.endsWith('.json')) return total
        const ruta = join(directorio, nombre)
        try {
          const dato = JSON.parse(readFileSync(ruta, 'utf-8')) as Partial<Registro>
          if (Number.isFinite(dato.actualizado) && momento - Number(dato.actualizado) <= TTL_MS) {
            return total + 1
          }
        } catch { /* registro corrupto: se descarta */ }
        rmSync(ruta, { force: true })
        return total
      }, 0)
    } catch {
      return 1
    }
  }

  return {
    activas,
    detener: () => {
      clearInterval(temporizador)
      rmSync(archivo, { force: true })
    }
  }
}
