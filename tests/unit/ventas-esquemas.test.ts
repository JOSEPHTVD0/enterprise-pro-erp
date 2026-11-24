import { describe, expect, it } from 'vitest'
import {
  anularDocumentoSchema, documentoVentaSchema, documentosFiltroSchema,
  posVentaSchema, suspenderVentaSchema
} from '@shared/schemas/ventas'

const linea = { productoId: 1, cantidad: 2, precioCent: 20000 }

describe('esquemas de ventas y POS', () => {
  it('aplica defaults y acepta una factura mínima', () => {
    const doc = documentoVentaSchema.parse({ tipo: 'FACTURA_CONTADO', clienteId: 1, lineas: [linea] })
    expect(doc).toMatchObject({
      tipo: 'FACTURA_CONTADO', comentarios: '', motivo: ''
    })
    expect(doc.almacenId).toBeUndefined()
    expect(doc.lineas[0]).toMatchObject({ descuentoPctBp: 0, exento: false, numeroSerie: '', lote: '' })
  })

  it('exige cliente, líneas y cantidades positivas', () => {
    expect(documentoVentaSchema.safeParse({ tipo: 'FACTURA_CONTADO', lineas: [linea] }).success).toBe(false)
    expect(documentoVentaSchema.safeParse({
      tipo: 'FACTURA_CONTADO', clienteId: 1, lineas: []
    }).success).toBe(false)
    expect(documentoVentaSchema.safeParse({
      tipo: 'FACTURA_CONTADO', clienteId: 1, lineas: [{ ...linea, cantidad: 0 }]
    }).success).toBe(false)
  })

  it('valida fechas y tipos de documento', () => {
    expect(documentoVentaSchema.safeParse({
      tipo: 'FACTURA_CONTADO', clienteId: 1, fecha: '23/11/2026', lineas: [linea]
    }).success).toBe(false)
    expect(documentoVentaSchema.safeParse({
      tipo: 'COMPRA', clienteId: 1, lineas: [linea]
    }).success).toBe(false)
  })

  it('exige pagos en POS y permite suspender sin pagos', () => {
    const base = { clienteId: 1, lineas: [linea] }
    expect(posVentaSchema.safeParse(base).success).toBe(false)
    expect(posVentaSchema.safeParse({
      ...base, pagos: [{ metodo: 'EFECTIVO', montoCent: 40000 }]
    }).success).toBe(true)
    expect(suspenderVentaSchema.safeParse({ nombre: 'Mesa 1', carrito: base }).success).toBe(true)
  })

  it('acepta pago combinado y rechaza montos no positivos', () => {
    expect(posVentaSchema.safeParse({
      clienteId: 1, lineas: [linea], pagos: [
        { metodo: 'EFECTIVO', montoCent: 30000 },
        { metodo: 'TARJETA', montoCent: 10000, referencia: '****4242' }
      ]
    }).success).toBe(true)
    expect(posVentaSchema.safeParse({
      clienteId: 1, lineas: [linea], pagos: [{ metodo: 'EFECTIVO', montoCent: 0 }]
    }).success).toBe(false)
  })

  it('aplica default de motivo y de filtro', () => {
    expect(anularDocumentoSchema.parse({ id: 5 }).motivo).toContain('Anulación')
    expect(documentosFiltroSchema.parse(undefined)).toEqual({ limite: 300 })
  })
})
