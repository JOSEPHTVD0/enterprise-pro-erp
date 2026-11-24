/**
 * Costo promedio ponderado — única fuente de cálculo de costos de inventario.
 *
 * Solo las entradas que incrementan valor (compras, devoluciones de venta,
 * ajustes positivos, conteos al alza, producción) recalculan el promedio:
 *
 *   valor_total = valor_existente + (costo_unitario_entrada × cantidad_entrada)
 *   cantidad_total = existencia + entrada
 *   nuevo_costo = valor_total / cantidad_total        (redondeado a centavos)
 *
 * El valor total se conserva en centavos y es la fuente de verdad del kardex;
 * el costo unitario es una proyección informativa redondeada. Las salidas
 * nunca recalculan: descuentan `costo_unitario × cantidad` al valor vigente.
 */

import { dividirCentavos, multiplicarCentavos, redondear, redondearCantidad } from './dinero'

export interface EntradaCosto {
  existenciaCantidad: number
  existenciaValorCent: number
  entradaCantidad: number
  entradaCostoUnitCent: number
}

export interface ResultadoEntrada {
  cantidad: number
  valorCent: number
  costoUnitCent: number
}

export interface ResultadoSalida {
  saldoCantidad: number
  saldoValorCent: number
  costoTotalCent: number
  costoUnitCent: number
}

function validarNoNegativo(valor: number, nombre: string): void {
  if (valor < 0) throw new Error(`${nombre} no puede ser negativo.`)
}

/** Entrada que recalcula el promedio ponderado. */
export function calcularEntrada(input: EntradaCosto): ResultadoEntrada {
  validarNoNegativo(input.existenciaCantidad, 'La existencia')
  validarNoNegativo(input.existenciaValorCent, 'El valor de la existencia')
  validarNoNegativo(input.entradaCostoUnitCent, 'El costo unitario de entrada')

  const entrada = redondearCantidad(input.entradaCantidad)
  if (entrada <= 0) throw new Error('La cantidad de entrada debe ser mayor que cero.')

  const valorEntrada = multiplicarCentavos(input.entradaCostoUnitCent, entrada)
  const cantidad = redondearCantidad(redondearCantidad(input.existenciaCantidad) + entrada)
  const valorCent = redondear(redondear(input.existenciaValorCent) + valorEntrada)
  const costoUnitCent = cantidad > 0 ? dividirCentavos(valorCent, cantidad) : 0
  return { cantidad, valorCent, costoUnitCent }
}

/** Entrada que NO recalcula (transferencia entre almacenes): conserva el valor. */
export function calcularEntradaSinRecalculo(
  existenciaCantidad: number,
  existenciaValorCent: number,
  entradaCantidad: number,
  costoUnitCent: number
): ResultadoEntrada {
  validarNoNegativo(existenciaCantidad, 'La existencia')
  validarNoNegativo(existenciaValorCent, 'El valor de la existencia')
  validarNoNegativo(costoUnitCent, 'El costo unitario')

  const entrada = redondearCantidad(entradaCantidad)
  if (entrada <= 0) throw new Error('La cantidad de entrada debe ser mayor que cero.')

  const cantidad = redondearCantidad(redondearCantidad(existenciaCantidad) + entrada)
  const valorCent = redondear(redondear(existenciaValorCent) + multiplicarCentavos(costoUnitCent, entrada))
  const costoUnitCentFinal = cantidad > 0 ? dividirCentavos(valorCent, cantidad) : redondear(costoUnitCent)
  return { cantidad, valorCent, costoUnitCent: costoUnitCentFinal }
}

/** Salida: usa el costo vigente y nunca modifica el promedio. */
export function calcularSalida(
  costoUnitCent: number,
  cantidadSalida: number,
  existenciaCantidad: number,
  existenciaValorCent: number
): ResultadoSalida {
  validarNoNegativo(costoUnitCent, 'El costo unitario')
  validarNoNegativo(existenciaValorCent, 'El valor de la existencia')

  const salida = redondearCantidad(Math.abs(cantidadSalida))
  if (salida <= 0) throw new Error('La cantidad de salida debe ser mayor que cero.')

  const saldoCantidad = redondearCantidad(redondearCantidad(existenciaCantidad) - salida)
  const costoTotalCent = multiplicarCentavos(costoUnitCent, salida)
  // Con stock negativo permitido el saldo puede ser < 0, pero el valor nunca es negativo.
  const saldoValorCent = Math.max(0, redondear(redondear(existenciaValorCent) - costoTotalCent))
  return { saldoCantidad, saldoValorCent, costoTotalCent, costoUnitCent: redondear(costoUnitCent) }
}

/**
 * Costo vigente para valorar salidas. Se deriva del saldo valorado cuando es
 * posible (evita desvíos por redondeo) y se respalda en el costo del producto.
 */
export function costoVigente(
  productoCostoPromedioCent: number,
  existenciaCantidad: number,
  existenciaValorCent: number
): number {
  const cantidad = redondearCantidad(existenciaCantidad)
  const valor = redondear(existenciaValorCent)
  if (cantidad > 0 && valor > 0) return dividirCentavos(valor, cantidad)
  return redondear(productoCostoPromedioCent)
}
