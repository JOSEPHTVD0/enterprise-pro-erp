import { multiplicarCentavos, redondear } from './dinero'
import { errors } from './errors'

/** Puntos base: 100 bp = 1 %. Toda tasa y descuento se persiste como entero. */
export const BP_POR_UNIDAD = 10000

export interface LineaImponible {
  cantidad: number
  precioCent: number
  /** Descuento 1. `descuentoCent` conserva la firma histórica de Fase 7. */
  descuentoPctBp?: number
  descuentoCent?: number
  /** Descuentos 2 y 3, aplicados en orden sobre la base restante. */
  descuento2PctBp?: number
  descuento2Cent?: number
  descuento3PctBp?: number
  descuento3Cent?: number
  tasaBp: number
  exento?: boolean
  impuestoCodigo?: string
}

export interface LineaCalculada {
  subtotalCent: number
  descuentoCent: number
  descuento1Cent: number
  descuento2Cent: number
  descuento3Cent: number
  baseCent: number
  impuestoCent: number
  totalCent: number
  tasaBp: number
  impuestoCodigo: string
  exento: boolean
}

export interface ResumenImponible {
  subtotalCent: number
  descuentoCent: number
  descuento1Cent: number
  descuento2Cent: number
  descuento3Cent: number
  baseCent: number
  exentoCent: number
  gravadoCent: number
  impuestoCent: number
  totalCent: number
  impuestosPorTasa: ImpuestoAgrupado[]
}

export interface ImpuestoAgrupado {
  codigo: string
  tasaBp: number
  baseCent: number
  impuestoCent: number
  exento: boolean
}

function validarBp(valor: number, campo: string): number {
  if (!Number.isInteger(valor) || valor < 0 || valor > BP_POR_UNIDAD) {
    throw errors.validation(`${campo} debe estar entre 0 y ${BP_POR_UNIDAD} puntos base.`)
  }
  return valor
}

/** Descuento porcentual o importe fijo. El importe fijo gana si ambos vienen. */
export function calcularDescuento(
  subtotalCent: number,
  descuentoPctBp = 0,
  descuentoCent?: number
): number {
  const base = redondear(subtotalCent)
  if (descuentoCent !== undefined) {
    const fijo = redondear(descuentoCent)
    if (fijo < 0) throw errors.validation('El descuento no puede ser negativo.')
    if (fijo > base) throw errors.validation('El descuento no puede superar el subtotal o la base disponible de la línea.')
    return fijo
  }
  const bp = validarBp(descuentoPctBp, 'El descuento')
  const resultado = multiplicarCentavos(base, bp / BP_POR_UNIDAD)
  return Math.min(resultado, base)
}

/** ITBIS por línea, calculado sobre la base ya descontada. */
export function calcularImpuesto(baseCent: number, tasaBp: number, exento = false): number {
  if (exento) return 0
  return multiplicarCentavos(redondear(baseCent), validarBp(tasaBp, 'La tasa de impuesto') / BP_POR_UNIDAD)
}

/**
 * Calcula una línea con hasta tres descuentos secuenciales. El motor sigue siendo
 * el mismo para renderer y backend: el subtotal de cada etapa es la base de la siguiente.
 */
export function calcularLinea(linea: LineaImponible): LineaCalculada {
  if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
    throw errors.validation('La cantidad de la línea debe ser mayor que cero.')
  }
  if (!Number.isInteger(linea.precioCent) || linea.precioCent < 0) {
    throw errors.validation('El precio de la línea debe ser un importe válido en centavos.')
  }

  const subtotalCent = multiplicarCentavos(linea.precioCent, linea.cantidad)
  const descuento1Cent = calcularDescuento(subtotalCent, linea.descuentoPctBp ?? 0, linea.descuentoCent)
  const base1Cent = subtotalCent - descuento1Cent
  const descuento2Cent = calcularDescuento(base1Cent, linea.descuento2PctBp ?? 0, linea.descuento2Cent)
  const base2Cent = base1Cent - descuento2Cent
  const descuento3Cent = calcularDescuento(base2Cent, linea.descuento3PctBp ?? 0, linea.descuento3Cent)
  const baseCent = base2Cent - descuento3Cent

  const exento = Boolean(linea.exento) || validarBp(linea.tasaBp, 'La tasa de impuesto') === 0 && Boolean(linea.impuestoCodigo?.toUpperCase().includes('EXENTO'))
  const tasaBp = exento ? 0 : validarBp(linea.tasaBp, 'La tasa de impuesto')
  const impuestoCent = calcularImpuesto(baseCent, tasaBp, exento)
  return {
    subtotalCent,
    descuentoCent: descuento1Cent + descuento2Cent + descuento3Cent,
    descuento1Cent,
    descuento2Cent,
    descuento3Cent,
    baseCent,
    impuestoCent,
    totalCent: baseCent + impuestoCent,
    tasaBp,
    impuestoCodigo: linea.impuestoCodigo ?? '',
    exento
  }
}

/** Suma de líneas y desglose por tasa. El total se recalcula para impedir derivas de redondeo. */
export function resumenLineas(lineas: LineaCalculada[]): ResumenImponible {
  const subtotalCent = lineas.reduce((sum, l) => sum + l.subtotalCent, 0)
  const descuento1Cent = lineas.reduce((sum, l) => sum + l.descuento1Cent, 0)
  const descuento2Cent = lineas.reduce((sum, l) => sum + l.descuento2Cent, 0)
  const descuento3Cent = lineas.reduce((sum, l) => sum + l.descuento3Cent, 0)
  const impuestoCent = lineas.reduce((sum, l) => sum + l.impuestoCent, 0)
  const exentoCent = lineas.reduce((sum, l) => sum + (l.exento ? l.baseCent : 0), 0)
  const gravadoCent = lineas.reduce((sum, l) => sum + (l.exento ? 0 : l.baseCent), 0)
  const baseCent = lineas.reduce((sum, l) => sum + l.baseCent, 0)
  const grupos = new Map<string, ImpuestoAgrupado>()
  for (const linea of lineas) {
    const clave = `${linea.impuestoCodigo}|${linea.tasaBp}|${linea.exento ? 1 : 0}`
    const grupo = grupos.get(clave) ?? {
      codigo: linea.impuestoCodigo, tasaBp: linea.tasaBp, baseCent: 0,
      impuestoCent: 0, exento: linea.exento
    }
    grupo.baseCent += linea.baseCent
    grupo.impuestoCent += linea.impuestoCent
    grupos.set(clave, grupo)
  }
  return {
    subtotalCent: redondear(subtotalCent),
    descuentoCent: redondear(descuento1Cent + descuento2Cent + descuento3Cent),
    descuento1Cent: redondear(descuento1Cent),
    descuento2Cent: redondear(descuento2Cent),
    descuento3Cent: redondear(descuento3Cent),
    baseCent: redondear(baseCent),
    exentoCent: redondear(exentoCent),
    gravadoCent: redondear(gravadoCent),
    impuestoCent: redondear(impuestoCent),
    totalCent: redondear(subtotalCent - descuento1Cent - descuento2Cent - descuento3Cent + impuestoCent),
    impuestosPorTasa: [...grupos.values()].map((g) => ({
      ...g, baseCent: redondear(g.baseCent), impuestoCent: redondear(g.impuestoCent)
    }))
  }
}

/** Cambio a devolver en efectivo. Nunca puede ser negativo. */
export function calcularCambio(totalCent: number, pagadoCent: number): number {
  return Math.max(0, redondear(pagadoCent) - redondear(totalCent))
}
