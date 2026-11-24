import { describe, expect, it } from 'vitest'
import {
  anticipoCrearSchema, bancoCuentaSchema, bancoMovimientoSchema,
  cerrarCajaFinanzasSchema, comisionCrearSchema, cxcReciboCrearSchema,
  cxpPagoCrearSchema, finanzasFiltroSchema, gastoCrearSchema
} from '@shared/schemas/finanzas'

describe('esquemas de finanzas (Fase 8)', () => {
  it('acepta un recibo de CxC con aplicaciones que cuadran y aplica defaults', () => {
    const recibo = cxcReciboCrearSchema.parse({
      clienteId: 1,
      montoCent: 15000,
      cajaSesionId: 3,
      aplicaciones: [{ cxcDocumentoId: 1, montoCent: 10000 }, { cxcDocumentoId: 2, montoCent: 5000 }]
    })
    expect(recibo).toMatchObject({
      metodo: 'EFECTIVO', referencia: '', comentarios: '', aplicaciones: [
        { cxcDocumentoId: 1, montoCent: 10000 }, { cxcDocumentoId: 2, montoCent: 5000 }
      ]
    })
  })

  it('rechaza recibos cuyas aplicaciones no cuadran o sin origen de dinero', () => {
    const base = {
      clienteId: 1, montoCent: 15000,
      aplicaciones: [{ cxcDocumentoId: 1, montoCent: 10000 }]
    }
    expect(cxcReciboCrearSchema.safeParse(base).success).toBe(false)
    expect(cxcReciboCrearSchema.safeParse({
      ...base, aplicaciones: [{ cxcDocumentoId: 1, montoCent: 15000 }]
    }).success).toBe(false)
    expect(cxcReciboCrearSchema.safeParse({
      ...base, aplicaciones: [{ cxcDocumentoId: 1, montoCent: 15000 }], bancoCuentaId: 2
    }).success).toBe(false)
  })

  it('valida pagos de CxP contra varias facturas', () => {
    const pago = cxpPagoCrearSchema.parse({
      proveedorId: 4, montoCent: 9000, bancoCuentaId: 1, metodo: 'TRANSFERENCIA',
      aplicaciones: [{ cxpDocumentoId: 1, montoCent: 4000 }, { cxpDocumentoId: 2, montoCent: 5000 }]
    })
    expect(pago.aplicaciones).toHaveLength(2)
    expect(cxpPagoCrearSchema.safeParse({
      proveedorId: 4, montoCent: 9000,
      aplicaciones: [{ cxpDocumentoId: 1, montoCent: 9000 }]
    }).success).toBe(false)
  })

  it('exige una contrapartida real para anticipos, gastos y comisiones pagadas', () => {
    const anticipo = {
      tipo: 'CLIENTE' as const, entidadId: 1, montoCent: 5000, cajaSesionId: 2
    }
    expect(anticipoCrearSchema.parse(anticipo)).toMatchObject({ metodo: 'EFECTIVO', referencia: '' })
    expect(anticipoCrearSchema.safeParse({ ...anticipo, cajaSesionId: undefined }).success).toBe(false)
    expect(gastoCrearSchema.safeParse({
      categoriaId: 1, concepto: 'Luz', montoCent: 1000
    }).success).toBe(false)
    expect(gastoCrearSchema.safeParse({
      categoriaId: 1, concepto: 'Luz', montoCent: 1000, bancoCuentaId: 1, metodo: 'BANCO'
    }).success).toBe(true)
    expect(comisionCrearSchema.parse({
      vendedorId: 1, docVentaId: 2, baseCent: 10000, pctBp: 1000
    })).toMatchObject({ baseCent: 10000, pctBp: 1000 })
    expect(comisionCrearSchema.safeParse({
      vendedorId: 1, docVentaId: 2, baseCent: 10000, pctBp: 10001
    }).success).toBe(false)
  })

  it('aplica defaults en cuentas, movimientos bancarios, arqueo y filtros', () => {
    expect(bancoCuentaSchema.parse({ codigo: 'BAN-01', nombre: 'Banco Popular' })).toMatchObject({
      tipo: 'CORRIENTE', saldoInicialCent: 0, activa: true, banco: '', numeroCuenta: ''
    })
    expect(bancoMovimientoSchema.safeParse({
      cuentaId: 1, tipo: 'DEPOSITO', montoCent: 0
    }).success).toBe(false)
    expect(cerrarCajaFinanzasSchema.parse({ sesionId: 1, arqueoEfectivoCent: 12500 })).toMatchObject({
      arqueoOtrosCent: 0, observaciones: ''
    })
    expect(finanzasFiltroSchema.parse(undefined)).toEqual({ limite: 300 })
  })
})
