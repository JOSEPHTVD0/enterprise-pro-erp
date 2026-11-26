import { describe, expect, it } from 'vitest'
import {
  anularCompraSchema, convertirCompraSchema, documentoCompraSchema,
  documentosFiltroCompraSchema, recepcionSchema,
  ingresoMercanciaSchema, editarIngresoSchema, historialIngresoSchema, imprimirCompraSchema
} from '@shared/schemas/compras'

const linea = { productoId: 1, cantidad: 2, precioCent: 10000 }

describe('esquemas de compras y CxP', () => {
  it('aplica defaults y acepta una factura mínima', () => {
    const doc = documentoCompraSchema.parse({
      tipo: 'FACTURA_COMPRA', proveedorId: 1, lineas: [linea]
    })
    expect(doc).toMatchObject({
      tipo: 'FACTURA_COMPRA', credito: false, comentarios: '', numeroProveedor: '', motivo: ''
    })
    expect(doc.lineas[0]).toMatchObject({
      descuentoPctBp: 0, exento: false, numeroSerie: '', lote: ''
    })
    expect(doc.lineas[0].docLineaId).toBeUndefined()
  })

  it('rechaza proveedor ausente, líneas vacías y cantidades inválidas', () => {
    expect(documentoCompraSchema.safeParse({ tipo: 'FACTURA_COMPRA', lineas: [linea] }).success).toBe(false)
    expect(documentoCompraSchema.safeParse({
      tipo: 'FACTURA_COMPRA', proveedorId: 1, lineas: []
    }).success).toBe(false)
    expect(documentoCompraSchema.safeParse({
      tipo: 'FACTURA_COMPRA', proveedorId: 1, lineas: [{ ...linea, cantidad: 0 }]
    }).success).toBe(false)
  })

  it('valida el número de factura/NCF del proveedor como sola referencia', () => {
    const doc = documentoCompraSchema.parse({
      tipo: 'FACTURA_COMPRA', proveedorId: 1, numeroProveedor: 'B0100000001', lineas: [linea]
    })
    expect(doc.numeroProveedor).toBe('B0100000001')
    expect(documentoCompraSchema.safeParse({
      tipo: 'FACTURA_COMPRA', proveedorId: 1, numeroProveedor: 'x'.repeat(61), lineas: [linea]
    }).success).toBe(false)
  })

  it('exige pagos positivos y una conversión con destino conocido', () => {
    expect(documentoCompraSchema.safeParse({
      tipo: 'FACTURA_COMPRA', proveedorId: 1, lineas: [linea],
      pagos: [{ metodo: 'EFECTIVO', montoCent: 0 }]
    }).success).toBe(false)
    expect(convertirCompraSchema.safeParse({ id: 1, tipoDestino: 'FACTURA_COMPRA' }).success).toBe(true)
    expect(convertirCompraSchema.safeParse({ id: 1, tipoDestino: 'NOVEDAD' }).success).toBe(false)
  })

  it('valida recepciones por línea de orden y el motivo de anulación', () => {
    expect(recepcionSchema.safeParse({
      ordenId: 1, lineas: [{ docLineaId: 2, cantidad: 3 }]
    }).success).toBe(true)
    expect(recepcionSchema.safeParse({ ordenId: 1, lineas: [] }).success).toBe(false)
    expect(anularCompraSchema.parse({ id: 1 }).motivo).toContain('Anulación')
    expect(anularCompraSchema.safeParse({ id: 1, motivo: 'x' }).success).toBe(false)
  })

  it('aplica el límite por defecto del filtro', () => {
    expect(documentosFiltroCompraSchema.parse(undefined)).toEqual({
      limite: 300, offset: 0, incluirAnulados: true, numero: '', numeroProveedor: ''
    })
    expect(documentosFiltroCompraSchema.parse({ tipo: 'FACTURA_COMPRA' }).tipo).toBe('FACTURA_COMPRA')
  })
})

describe('Ingreso de mercancía — contratos compartidos', () => {
  it('aplica defaults de moneda, tasa, clasificación y descuentos', () => {
    const ingreso = ingresoMercanciaSchema.parse({ proveedorId: 1, lineas: [linea] })
    expect(ingreso).toMatchObject({
      tipo: 'FACTURA_COMPRA', monedaCodigo: 'DOP', tasaAplicada: 1,
      clasificacionContable: '1200', fleteCent: 0, ajusteCent: 0,
      numeroProveedor: '', numeroOrdenCompra: '', nota: '', credito: false
    })
    expect(ingreso.lineas[0]).toMatchObject({
      descuentoPctBp: 0, descuento2PctBp: 0, descuento3PctBp: 0, exento: false
    })
  })

  it('valida fecha, moneda, cuenta y tasa antes de llegar al servicio', () => {
    const base = { proveedorId: 1, lineas: [linea] }
    expect(ingresoMercanciaSchema.safeParse({ ...base, fecha: '15-01-2026' }).success).toBe(false)
    expect(ingresoMercanciaSchema.safeParse({ ...base, monedaCodigo: 'peso' }).success).toBe(false)
    expect(ingresoMercanciaSchema.safeParse({ ...base, clasificacionContable: '12' }).success).toBe(false)
    expect(ingresoMercanciaSchema.safeParse({ ...base, tasaAplicada: 0 }).success).toBe(false)
    expect(ingresoMercanciaSchema.safeParse({ ...base, fleteCent: -1 }).success).toBe(false)
    expect(ingresoMercanciaSchema.safeParse({ ...base, ajusteCent: -500 }).success).toBe(true)
  })

  it('exige id y motivo para corregir, y acepta búsqueda e impresión con defaults', () => {
    expect(editarIngresoSchema.safeParse({ proveedorId: 1, lineas: [linea], motivo: 'ab' }).success).toBe(false)
    expect(editarIngresoSchema.safeParse({
      id: 1, proveedorId: 1, lineas: [linea], motivo: 'Corrección de cantidad'
    }).success).toBe(true)
    expect(historialIngresoSchema.parse({ texto: 'B010' })).toMatchObject({
      texto: 'B010', limite: 300, offset: 0, incluirAnulados: true
    })
    expect(imprimirCompraSchema.parse({ id: 1 })).toMatchObject({ id: 1, formato: 'CARTA' })
  })
})
