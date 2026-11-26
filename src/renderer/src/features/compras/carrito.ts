import { centavosDesdeDecimal, redondear } from '@shared/dinero'
import { calcularLinea, resumenLineas, type LineaCalculada } from '@shared/impuestos'
import { clave, num, txt, type CatalogosCompras, type FormularioCompra, type LineaCompra } from './types'

/** Utilidades del carrito de compras. Usan el mismo motor de cálculo que el backend. */

export function impuestoPorDefecto(catalogos: CatalogosCompras): number | undefined {
  const encontrado = catalogos.impuestos.find((i) => i.codigo === catalogos.impuestoPorDefecto)
  return encontrado ? Number(encontrado.id) : undefined
}

function datosImpuesto(catalogos: CatalogosCompras, impuestoId: string): { tasaBp: number; exento: boolean } {
  const impuesto = catalogos.impuestos.find((i) => String(i.id) === impuestoId)
  return {
    tasaBp: impuesto ? Number(impuesto.tasaBp) : 0,
    exento: impuesto ? Boolean(impuesto.exento) : false
  }
}

export function centavos(texto: unknown): number {
  const valor = typeof texto === 'number' ? texto : Number(txt(texto).replace(/,/g, ''))
  return Number.isFinite(valor) && valor >= 0 ? centavosDesdeDecimal(valor) : 0
}

/** El usuario escribe porcentaje (18); el motor persiste puntos base (1800). */
export function puntosBase(texto: unknown): number {
  const valor = Number(txt(texto).replace(',', '.'))
  if (!Number.isFinite(valor) || valor < 0) return 0
  return Math.min(10000, redondear(valor * 100))
}

export function nuevaLinea(
  catalogos: CatalogosCompras, productoId?: string, extra: Partial<LineaCompra> = {}
): LineaCompra {
  const producto = catalogos.productos.find((p) => String(p.id) === productoId)
  const ultimo = num(producto?.costoUltimaCompraCent) || num(producto?.costoPromedioCent)
  return {
    key: clave(),
    productoId: productoId ?? '',
    cantidad: '1',
    costo: ultimo ? (ultimo / 100).toFixed(2) : '0.00',
    pvs: producto?.precio1Cent ? (producto.precio1Cent / 100).toFixed(2) : '0.00',
    referencia: producto?.referencia ?? '',
    descuentoPct: '0', descuento2Pct: '0', descuento3Pct: '0',
    gasto: '0.00',
    impuestoId: producto?.impuestoId
      ? String(producto.impuestoId)
      : (impuestoPorDefecto(catalogos)?.toString() ?? ''),
    exento: false,
    numeroSerie: '',
    lote: '',
    ...extra
  }
}

/** Cálculo de una fila para la tabla del ingreso. Devuelve null si está incompleta. */
export function calcularFila(
  catalogos: CatalogosCompras, linea: LineaCompra
): LineaCalculada | null {
  const cantidad = Number(linea.cantidad)
  if (!linea.productoId || !Number.isFinite(cantidad) || cantidad <= 0) return null
  const { tasaBp, exento } = datosImpuesto(catalogos, linea.impuestoId)
  try {
    return calcularLinea({
      cantidad,
      precioCent: centavos(linea.costo),
      descuentoPctBp: puntosBase(linea.descuentoPct),
      descuento2PctBp: puntosBase(linea.descuento2Pct),
      descuento3PctBp: puntosBase(linea.descuento3Pct),
      tasaBp,
      exento: linea.exento || exento
    })
  } catch {
    return null
  }
}

function lineasCalculadas(catalogos: CatalogosCompras, lineas: LineaCompra[]): LineaCalculada[] {
  const resultado: LineaCalculada[] = []
  for (const linea of lineas) {
    const calculo = calcularFila(catalogos, linea)
    if (calculo) resultado.push(calculo)
  }
  return resultado
}

export interface OpcionesTotalesCompra {
  fleteCent?: number
  ajusteCent?: number
  montoFacturaCent?: number
}

export function totalesCarrito(
  catalogos: CatalogosCompras, lineas: LineaCompra[], opciones: OpcionesTotalesCompra = {}
) {
  const resumen = resumenLineas(lineasCalculadas(catalogos, lineas))
  const gastoCent = lineas.reduce((suma, linea) => suma + centavos(linea.gasto), 0)
  const fleteCent = opciones.fleteCent ?? 0
  const ajusteCent = opciones.ajusteCent ?? 0
  const montoFacturaCent = opciones.montoFacturaCent
  const totalCent = resumen.totalCent + gastoCent + fleteCent + ajusteCent
  return {
    ...resumen,
    baseCent: resumen.baseCent,
    gastoCent,
    fleteCent,
    ajusteCent,
    montoFacturaCent: montoFacturaCent ?? totalCent,
    diferenciaCent: (montoFacturaCent ?? totalCent) - totalCent,
    totalCent,
    costoTotalCent: resumen.baseCent + gastoCent + fleteCent + ajusteCent
  }
}

/** Una fila sin producto, cantidad o costo no debe llegar a Zod. */
export function primeraLineaIncompleta(lineas: LineaCompra[]): boolean {
  return lineas.some((linea) =>
    !linea.productoId || Number(linea.cantidad) <= 0 || centavos(linea.costo) <= 0
  )
}

/** Convierte el formulario al payload validado por el router. */
export function payloadLineas(lineas: LineaCompra[]) {
  return lineas
    .filter((linea) => linea.productoId && Number(linea.cantidad) > 0 && centavos(linea.costo) > 0)
    .map((linea) => ({
      productoId: num(linea.productoId),
      docLineaId: linea.docLineaId ? num(linea.docLineaId) : undefined,
      cantidad: Number(linea.cantidad),
      precioCent: centavos(linea.costo),
      pvsCent: centavos(linea.pvs),
      referencia: linea.referencia,
      descuentoPctBp: puntosBase(linea.descuentoPct),
      descuento2PctBp: puntosBase(linea.descuento2Pct),
      descuento3PctBp: puntosBase(linea.descuento3Pct),
      gastoCent: centavos(linea.gasto),
      impuestoId: linea.impuestoId ? num(linea.impuestoId) : undefined,
      exento: linea.exento,
      numeroSerie: linea.numeroSerie,
      lote: linea.lote
    }))
}

export function payloadPagos(pagos: { metodo: string; monto: string; referencia: string }[]) {
  return pagos.map((pago) => ({
    metodo: pago.metodo as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO',
    montoCent: centavos(pago.monto),
    referencia: pago.referencia
  }))
}

export function payloadCabecera(form: FormularioCompra) {
  return {
    tipo: form.tipo,
    proveedorId: num(form.proveedorId),
    almacenId: form.almacenId ? num(form.almacenId) : undefined,
    fecha: form.fecha || undefined,
    vencimiento: form.vencimiento || undefined,
    numeroProveedor: form.numeroProveedor,
    comentarios: form.comentarios,
    motivo: form.motivo,
    docOrigenId: form.docOrigenId ? num(form.docOrigenId) : undefined,
    credito: form.credito,
    pagos: form.tipo === 'FACTURA_COMPRA' && !form.credito ? payloadPagos(form.pagos) : undefined,
    lineas: payloadLineas(form.lineas)
  }
}

/** Payload del ingreso de mercancía; todos los importes viajan como centavos. */
export function payloadIngreso(form: FormularioCompra, totalCent: number) {
  const tasa = Number(form.tasa) > 0 ? Number(form.tasa) : 1
  return {
    proveedorId: num(form.proveedorId),
    almacenId: form.almacenId ? num(form.almacenId) : undefined,
    fecha: form.fecha || undefined,
    fechaLlegada: form.fechaLlegada || undefined,
    vencimiento: form.vencimiento || undefined,
    numeroProveedor: form.numeroProveedor,
    numeroOrdenCompra: form.numeroOrdenCompra,
    clasificacionContable: form.clasificacionContable || '1200',
    monedaCodigo: form.monedaCodigo || 'DOP',
    tasaAplicada: tasa,
    montoFacturaCent: form.montoFactura ? centavos(form.montoFactura) : totalCent,
    montoFacturaMonedaCent: form.montoFacturaMoneda
      ? centavos(form.montoFacturaMoneda)
      : (form.monedaCodigo === 'DOP' ? totalCent : redondear(totalCent / tasa)),
    ajusteCent: centavosDesdeDecimal(Number(form.ajuste) || 0),
    fleteCent: centavos(form.flete),
    nota: form.nota,
    comentarios: form.comentarios,
    credito: form.credito,
    pagos: form.credito ? undefined : payloadPagos(form.pagos),
    lineas: payloadLineas(form.lineas)
  }
}
