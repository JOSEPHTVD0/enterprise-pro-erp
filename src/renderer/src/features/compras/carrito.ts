import { centavosDesdeDecimal } from '@shared/dinero'
import { calcularLinea, resumenLineas, type LineaCalculada } from '@shared/impuestos'
import { clave, num, type CatalogosCompras, type FormularioCompra, type LineaCompra } from './types'

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

function centavos(texto: string): number {
  const valor = Number(texto)
  return Number.isFinite(valor) && valor >= 0 ? centavosDesdeDecimal(valor) : 0
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
    descuentoPct: '0',
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

function lineasCalculadas(catalogos: CatalogosCompras, lineas: LineaCompra[]): LineaCalculada[] {
  const resultado: LineaCalculada[] = []
  for (const linea of lineas) {
    const cantidad = Number(linea.cantidad)
    if (!linea.productoId || !Number.isFinite(cantidad) || cantidad <= 0) continue
    const { tasaBp, exento } = datosImpuesto(catalogos, linea.impuestoId)
    try {
      resultado.push(calcularLinea({
        cantidad,
        precioCent: centavos(linea.costo),
        descuentoPctBp: centavos(linea.descuentoPct),
        tasaBp,
        exento: linea.exento || exento
      }))
    } catch {
      // Un campo incompleto no debe impedir ver el resto del documento.
    }
  }
  return resultado
}

export function totalesCarrito(catalogos: CatalogosCompras, lineas: LineaCompra[]) {
  const resumen = resumenLineas(lineasCalculadas(catalogos, lineas))
  const gastoCent = lineas.reduce((suma, linea) => suma + centavos(linea.gasto), 0)
  const baseCent = resumen.subtotalCent - resumen.descuentoCent
  return {
    ...resumen,
    baseCent,
    gastoCent,
    totalCent: resumen.totalCent + gastoCent,
    costoTotalCent: baseCent + gastoCent
  }
}

/** Convierte el formulario al payload validado por el router. */
export function payloadLineas(lineas: LineaCompra[]) {
  return lineas.map((linea) => ({
    productoId: num(linea.productoId),
    docLineaId: linea.docLineaId ? num(linea.docLineaId) : undefined,
    cantidad: Number(linea.cantidad),
    precioCent: centavos(linea.costo),
    descuentoPctBp: centavos(linea.descuentoPct),
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
