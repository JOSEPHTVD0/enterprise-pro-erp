import { describe, expect, it } from 'vitest'
import {
  anularCompraSchema, convertirCompraSchema, documentoCompraSchema,
  documentosFiltroCompraSchema, recepcionSchema
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
    expect(documentosFiltroCompraSchema.parse(undefined)).toEqual({ limite: 300 })
    expect(documentosFiltroCompraSchema.parse({ tipo: 'FACTURA_COMPRA' }).tipo).toBe('FACTURA_COMPRA')
  })
})
