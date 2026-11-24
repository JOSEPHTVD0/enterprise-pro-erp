import { centavosDesdeDecimal } from '@shared/dinero'
import { calcularCambio, calcularLinea, resumenLineas, type LineaCalculada } from '@shared/impuestos'
import { clave, num, type CatalogosVentas, type FormularioVenta, type LineaCarrito } from './types'

/** Utilidades del carrito. Usan el mismo motor de cálculo que el backend. */

export function impuestoPorDefecto(catalogos: CatalogosVentas): number | undefined {
  const encontrado = catalogos.impuestos.find((i) => i.codigo === catalogos.impuestoPorDefecto)
  return encontrado ? Number(encontrado.id) : undefined
}

export function datosImpuesto(catalogos: CatalogosVentas, impuestoId: string): { tasaBp: number; exento: boolean } {
  const impuesto = catalogos.impuestos.find((i) => String(i.id) === impuestoId)
  return {
    tasaBp: impuesto ? Number(impuesto.tasaBp) : 0,
    exento: impuesto ? Boolean(impuesto.exento) : false
  }
}

export function nuevaLinea(catalogos: CatalogosVentas, productoId?: string): LineaCarrito {
  const producto = catalogos.productos.find((p) => String(p.id) === productoId)
  return {
    key: clave(),
    productoId: productoId ?? '',
    cantidad: '1',
    precioCent: producto ? (Number(producto.precio1Cent) / 100).toFixed(2) : '0.00',
    descuentoPct: '0',
    impuestoId: producto?.impuestoId ? String(producto.impuestoId) : (impuestoPorDefecto(catalogos)?.toString() ?? ''),
    exento: false,
    numeroSerie: '',
    lote: ''
  }
}

function centavos(texto: string): number {
  const valor = Number(texto)
  return Number.isFinite(valor) && valor >= 0 ? centavosDesdeDecimal(valor) : 0
}

function lineasCalculadas(catalogos: CatalogosVentas, lineas: LineaCarrito[]): LineaCalculada[] {
  const resultado: LineaCalculada[] = []
  for (const linea of lineas) {
    const producto = catalogos.productos.find((p) => String(p.id) === linea.productoId)
    const cantidad = Number(linea.cantidad)
    if (!producto || !Number.isFinite(cantidad) || cantidad <= 0) continue
    const { tasaBp, exento } = datosImpuesto(catalogos, linea.impuestoId)
    try {
      resultado.push(calcularLinea({
        cantidad,
        precioCent: centavos(linea.precioCent),
        descuentoPctBp: centavos(linea.descuentoPct),
        tasaBp,
        exento: linea.exento || exento
      }))
    } catch {
      // Un campo incompleto no debe impedir ver el resto del carrito.
    }
  }
  return resultado
}

export function totalesCarrito(catalogos: CatalogosVentas, lineas: LineaCarrito[]) {
  const resumen = resumenLineas(lineasCalculadas(catalogos, lineas))
  return {
    ...resumen,
    baseCent: resumen.subtotalCent - resumen.descuentoCent
  }
}

export function cambioPago(totalCent: number, pagos: { monto: string }[]): number {
  const pagado = pagos.reduce((suma, pago) => suma + centavos(pago.monto), 0)
  return calcularCambio(totalCent, pagado)
}

/** Convierte el formulario al payload que valida el router. */
export function payloadLineas(lineas: LineaCarrito[]) {
  return lineas.map((linea) => ({
    productoId: num(linea.productoId),
    cantidad: Number(linea.cantidad),
    precioCent: centavos(linea.precioCent),
    descuentoPctBp: centavos(linea.descuentoPct),
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

export function payloadCabecera(form: FormularioVenta) {
  return {
    clienteId: num(form.clienteId),
    almacenId: form.almacenId ? num(form.almacenId) : undefined,
    vendedorId: form.vendedorId ? num(form.vendedorId) : undefined,
    fecha: form.fecha || undefined,
    vencimiento: form.vencimiento || undefined,
    comentarios: form.comentarios,
    lineas: payloadLineas(form.lineas)
  }
}
