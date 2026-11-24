import { describe, expect, it, vi } from 'vitest'
import { generarPdf, type FuentesPdf } from '../../src/main/services/pdf.service'
import type { SessionContext } from '../../src/main/services/context'

const ctx = {} as SessionContext

const datosDocumento = {
  empresa: {
    nombreComercial: 'Enterprise Pro', razonSocial: 'Enterprise Pro SRL',
    rnc: '123456789', direccion: 'Santo Domingo'
  },
  documento: {
    tipo: 'FACTURA', numero: 'A-0001', fecha: '2026-11-24', estado: 'ACTIVO',
    clienteNombre: 'Cliente Prueba', subtotalCent: 100000, impuestoCent: 18000, totalCent: 118000
  },
  lineas: [
    { descripcion: 'Servicio', cantidad: 2, precioCent: 50000, impuestoCent: 18000, totalCent: 118000 }
  ],
  pagos: [{ metodo: 'EFECTIVO', montoCent: 118000 }]
}

function fuentes(overrides: Partial<FuentesPdf> = {}): FuentesPdf {
  const imprimir = vi.fn(() => datosDocumento)
  return {
    ventas: { datosImpresion: imprimir as never },
    compras: { datosImpresion: imprimir as never },
    finanzas: {
      cxcImprimir: imprimir as never,
      cxpImprimir: imprimir as never,
      bancosImprimir: imprimir as never,
      cajasImprimir: imprimir as never
    },
    reportes: { imprimir: imprimir as never },
    ...overrides
  }
}

const esPdf = (base64: string) => Buffer.from(base64, 'base64').subarray(0, 5).toString() === '%PDF-'

describe('PDF nativo con pdfmake', () => {
  it('genera un PDF válido para un documento de venta', async () => {
    const archivo = await generarPdf(ctx, { origen: 'venta', id: 1, formato: 'CARTA' }, fuentes())
    expect(archivo.mime).toBe('application/pdf')
    expect(archivo.filename).toMatch(/^FACTURA_\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(esPdf(archivo.base64)).toBe(true)
  })

  it('genera un ticket en origen POS sin alterar los datos', async () => {
    const archivo = await generarPdf(ctx, { origen: 'venta', id: 1, formato: 'TICKET_80' }, fuentes())
    expect(esPdf(archivo.base64)).toBe(true)
  })

  it('valida el filtro del reporte con el esquema compartido', async () => {
    const imprimir = vi.fn(() => ({
      titulo: 'Ventas', empresa: {}, generadoEn: '2026-11-24T00:00:00.000Z',
      filtro: {}, columnas: [{ key: 'numero', header: 'Número' }],
      filas: [{ numero: 'A-0001' }], totales: { totalCent: 118000 },
      registros: 1, aviso: 'Datos reales.'
    }))
    const archivo = await generarPdf(ctx, {
      origen: 'reporte', reporte: 'VENTAS', formato: 'CARTA'
    }, fuentes({ reportes: { imprimir: imprimir as never } }))
    expect(esPdf(archivo.base64)).toBe(true)
    expect(imprimir).toHaveBeenCalledWith(ctx, expect.objectContaining({
      reporte: 'VENTAS', filtro: expect.objectContaining({ limite: 300 })
    }))
  })

  it('propaga el error de permisos del servicio de origen', async () => {
    const sinPermiso = () => { throw new Error('SIN_PERMISO: ventas.imprimir') }
    await expect(generarPdf(ctx, { origen: 'venta', id: 1, formato: 'CARTA' }, fuentes({
      ventas: { datosImpresion: sinPermiso as never }
    }))).rejects.toThrow('SIN_PERMISO')
  })
})
