import type { Db } from '../db/connection'
import { errors } from '@shared/errors'

/**
 * Numeración consecutiva centralizada.
 *
 * Regla única para todo el ERP: `prefijo + subserie + correlativo con ceros a la izquierda`.
 * El correlativo se reserva con una sola sentencia `UPDATE ... RETURNING`, dentro de la
 * transacción del documento. Si la operación falla, la transacción revierte el contador:
 * por eso no hay saltos. Ningún servicio debe manipular `series_documento.siguiente` por
 * su cuenta.
 */

export interface FilaSerie {
  id: number
  empresa_id: number
  tipo_doc: string
  serie: string
  prefijo: string
  siguiente: number
  longitud: number
  es_ncf: number
  rango_desde: string
  rango_hasta: string
  vence_en: string
  alerta_min: number
  activa: number
}

export interface NumeroConsecutivo {
  numero: string
  correlativo: number
  tipoDoc: string
  prefijo: string
  serie: string
  esNcf: boolean
}

export interface AlertaSerie {
  tipoDoc: string
  numeroSiguiente: string
  correlativo: number
  restantes: number
  estado: 'OK' | 'ALERTA' | 'AGOTADA' | 'VENCIDA' | 'INACTIVA'
  detalle: string
}

const texto = (v: unknown): string => String(v ?? '').trim()
const entero = (v: unknown): number => Number(v ?? 0)

/**
 * Si existen varias series activas para el mismo tipo, se usa siempre la de menor id.
 * El preview de la pantalla de series muestra cuál se aplicará; así la numeración
 * nunca depende del orden físico de SQLite.
 */
export function obtenerSerie(db: Db, empresaId: number, tipoDoc: string): FilaSerie | undefined {
  return db.prepare(`
    SELECT * FROM series_documento WHERE empresa_id = ? AND tipo_doc = ?
    ORDER BY activa DESC, id ASC LIMIT 1
  `).get(empresaId, tipoDoc) as FilaSerie | undefined
}

function correlativoMaximo(longitud: number): number {
  const base = Math.pow(10, Math.max(1, Math.min(longitud || 8, 15)))
  return Math.min(base - 1, Number.MAX_SAFE_INTEGER)
}

/** Parte correlativa de un rango. Acepta rangos con prefijo (NCF) o solo dígitos. */
function correlativoDeRango(rango: string, longitud: number): number | null {
  const valor = texto(rango)
  if (!valor) return null
  if (/^\d+$/.test(valor)) return Number(valor)
  const cola = valor.slice(-Math.max(1, longitud || 8))
  return /^\d+$/.test(cola) ? Number(cola) : null
}

function formatear(serie: FilaSerie, correlativo: number): string {
  const anchura = Math.max(1, entero(serie.longitud) || 8)
  return `${texto(serie.prefijo)}${texto(serie.serie)}${String(correlativo).padStart(anchura, '0')}`
}

/** Valida la serie ANTES de tocar el contador; así un rechazo nunca consume un número. */
export function validarSerie(serie: FilaSerie, fecha?: string): void {
  if (!serie.activa) throw errors.conflict(`La serie ${serie.tipo_doc} está inactiva.`)
  if (serie.es_ncf && fecha && texto(serie.vence_en) && texto(serie.vence_en) < fecha) {
    throw errors.conflict('La serie NCF configurada está vencida.')
  }
  const correlativo = entero(serie.siguiente)
  const desde = texto(serie.rango_desde)
  const hasta = texto(serie.rango_hasta)
  if (serie.es_ncf && desde) {
    const minimo = correlativoDeRango(desde, entero(serie.longitud))
    if (minimo !== null && correlativo < minimo) {
      throw errors.conflict('El número siguiente está fuera del rango NCF configurado.')
    }
  }
  if (serie.es_ncf && hasta) {
    const maximo = correlativoDeRango(hasta, entero(serie.longitud))
    if (maximo !== null && correlativo > maximo) {
      throw errors.conflict('Se agotó el rango NCF configurado.')
    }
  }
}

/**
 * Reserva el siguiente correlativo y devuelve el número formateado.
 * Debe invocarse dentro de `db.transaction` del documento que lo consume.
 */
export function numerarConsecutivo(
  db: Db,
  empresaId: number,
  tipoDoc: string,
  opciones: { fecha?: string } = {}
): NumeroConsecutivo {
  const serie = obtenerSerie(db, empresaId, tipoDoc)
  if (!serie) throw errors.conflict(`No hay serie configurada para ${tipoDoc}. Configure una serie antes de continuar.`)
  validarSerie(serie, opciones.fecha)

  const fila = db.prepare(`
    UPDATE series_documento SET siguiente = siguiente + 1
    WHERE id = ? AND activa = 1
    RETURNING prefijo, serie, siguiente, longitud
  `).get(serie.id) as { prefijo: string; serie: string; siguiente: number; longitud: number } | undefined
  if (!fila) throw errors.conflict(`No hay serie activa para ${tipoDoc}.`)

  // RETURNING entrega el valor ya incrementado; el reservado es el inmediatamente anterior.
  const correlativo = entero(fila.siguiente) - 1
  return {
    numero: `${texto(fila.prefijo)}${texto(fila.serie)}${String(correlativo).padStart(Math.max(1, entero(fila.longitud) || 8), '0')}`,
    correlativo,
    tipoDoc,
    prefijo: texto(fila.prefijo),
    serie: texto(fila.serie),
    esNcf: Boolean(serie.es_ncf)
  }
}

/** Solo lectura: muestra el número que se reservaría, sin consumirlo. */
export function vistaPreviaSerie(db: Db, empresaId: number, tipoDoc: string, fecha?: string): NumeroConsecutivo {
  const serie = obtenerSerie(db, empresaId, tipoDoc)
  if (!serie) throw errors.conflict(`No hay serie configurada para ${tipoDoc}.`)
  validarSerie(serie, fecha)
  const correlativo = entero(serie.siguiente)
  return {
    numero: formatear(serie, correlativo),
    correlativo,
    tipoDoc,
    prefijo: texto(serie.prefijo),
    serie: texto(serie.serie),
    esNcf: Boolean(serie.es_ncf)
  }
}

/** Estado de todas las series: quién está por agotarse, vencida o inactiva. */
export function alertasSeries(db: Db, empresaId: number, fecha?: string): AlertaSerie[] {
  const hoy = fecha ?? new Date().toISOString().slice(0, 10)
  const filas = db.prepare(`
    SELECT * FROM series_documento WHERE empresa_id = ? ORDER BY tipo_doc
  `).all(empresaId) as FilaSerie[]
  return filas.map((serie) => {
    const correlativo = entero(serie.siguiente)
    const maximoRango = correlativoDeRango(texto(serie.rango_hasta), entero(serie.longitud))
    const restantes = Math.max(0, (maximoRango ?? correlativoMaximo(entero(serie.longitud))) - correlativo + 1)
    let estado: AlertaSerie['estado'] = 'OK'
    let detalle = `${restantes} número(s) disponible(s).`
    if (!serie.activa) {
      estado = 'INACTIVA'
      detalle = 'La serie está inactiva; no se pueden emitir documentos.'
    } else if (serie.es_ncf && texto(serie.vence_en) && texto(serie.vence_en) < hoy) {
      estado = 'VENCIDA'
      detalle = `Venció el ${texto(serie.vence_en)}.`
    } else if (restantes === 0) {
      estado = 'AGOTADA'
      detalle = 'No quedan correlativos disponibles.'
    } else if (restantes <= Math.max(0, entero(serie.alerta_min))) {
      estado = 'ALERTA'
      detalle = `Quedan ${restantes} número(s); umbral de alerta ${entero(serie.alerta_min)}.`
    }
    return {
      tipoDoc: serie.tipo_doc,
      numeroSiguiente: formatear(serie, correlativo),
      correlativo,
      restantes,
      estado,
      detalle
    }
  })
}
