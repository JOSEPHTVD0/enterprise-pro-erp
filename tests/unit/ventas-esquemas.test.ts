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

  it('POS no exige pagos y permite suspender sin pagos', () => {
    const base = { clienteId: 1, lineas: [linea] }
    expect(posVentaSchema.safeParse(base).success).toBe(true)
    expect(suspenderVentaSchema.safeParse({ nombre: 'Mesa 1', carrito: base }).success).toBe(true)
  })

  it('Ventas y POS no transportan pagos: el cobro es un módulo aparte', () => {
    const pagos = [{ metodo: 'EFECTIVO', montoCent: 40000 }]
    const factura = documentoVentaSchema.parse({
      tipo: 'FACTURA_CONTADO', clienteId: 1, lineas: [linea], pagos
    })
    const pos = posVentaSchema.parse({ clienteId: 1, lineas: [linea], pagos })
    expect('pagos' in factura).toBe(false)
    expect('pagos' in pos).toBe(false)
  })

  it('aplica default de motivo y de filtro', () => {
    expect(anularDocumentoSchema.parse({ id: 5 }).motivo).toContain('Anulación')
    expect(documentosFiltroSchema.parse(undefined)).toEqual({ limite: 300 })
  })
})
