import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { documentosFiltroSchema, estadosDocumentoVenta } from '@shared/schemas/ventas'
import { finanzasFiltroSchema } from '@shared/schemas/finanzas'
import { ajustesSaveSchema, defaultAjustes, dgiEnlaceVisualSchema } from '@shared/schemas/ajustes'
import {
  aCentavos, coincideFiltroComercial, filtroComercialVacio, payloadFiltroComercial
} from '@/features/ventas/filtros-comerciales'

describe('búsqueda filtrada comercial', () => {
  it('acepta cliente, número, estado, fechas, monto y producto en ventas', () => {
    const filtro = documentosFiltroSchema.parse({
      clienteId: 7, numero: 'FAC-0001', estado: 'ACTIVO', fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-31', montoMinCent: 1000, montoMaxCent: 9000, productoId: 3
    })
    expect(filtro).toMatchObject({
      clienteId: 7, numero: 'FAC-0001', montoMinCent: 1000, montoMaxCent: 9000, productoId: 3
    })
    expect(documentosFiltroSchema.safeParse({ montoMinCent: -1 }).success).toBe(false)
    expect(documentosFiltroSchema.safeParse({ numero: 'x'.repeat(61) }).success).toBe(false)
    expect(estadosDocumentoVenta).not.toContain('BORRADOR')
  })

  it('acepta los mismos criterios en el contrato de cobros/CxC', () => {
    const filtro = finanzasFiltroSchema.parse({
      entidadId: 4, numero: 'RIN-0002', estado: 'PENDIENTE', desde: '2026-02-01',
      hasta: '2026-02-28', montoMinCent: 500, montoMaxCent: 50000, productoId: 8
    })
    expect(filtro.numero).toBe('RIN-0002')
    expect(filtro.montoMaxCent).toBe(50000)
    expect(finanzasFiltroSchema.safeParse({ montoMaxCent: -2 }).success).toBe(false)
  })

  it('convierte pesos a centavos y compone un payload seguro', () => {
    expect(aCentavos('1,250.50')).toBe(125050)
    expect(aCentavos('abc')).toBeUndefined()
    expect(aCentavos('-1')).toBeUndefined()

    const base = filtroComercialVacio()
    const payload = payloadFiltroComercial({
      ...base, numero: ' FAC-9 ', cliente: '12', estado: 'PENDIENTE', tipo: 'FACTURA_CREDITO',
      desde: '2026-01-01', hasta: '2026-01-31', montoMin: '10', montoMax: '20', productoId: '5'
    })
    expect(payload).toMatchObject({
      numero: 'FAC-9', clienteId: 12, entidadId: 12, estado: 'PENDIENTE',
      tipo: 'FACTURA_CREDITO', fechaDesde: '2026-01-01', desde: '2026-01-01',
      montoMinCent: 1000, montoMaxCent: 2000, productoId: 5
    })
  })

  it('filtra localmente filas ya cargadas sin recalcular saldos', () => {
    const fila = {
      numeroDocumento: 'FAC-0001', clienteNombre: 'Cliente Uno', clienteId: 12,
      estado: 'PENDIENTE', fecha: '2026-01-15', totalCent: 15000, saldoCent: 7000
    }
    const base = filtroComercialVacio()
    expect(coincideFiltroComercial(fila, { ...base, numero: '0001', cliente: 'Uno' })).toBe(true)
    expect(coincideFiltroComercial(fila, { ...base, montoMin: '200' })).toBe(false)
    expect(coincideFiltroComercial(fila, { ...base, estado: 'PAGADO' })).toBe(false)
    const filaConProducto = { ...fila, productoIds: [9] }
    expect(coincideFiltroComercial(filaConProducto, { ...base, productoId: '9' })).toBe(true)
    expect(coincideFiltroComercial(filaConProducto, { ...base, productoId: '8' })).toBe(false)
  })
})

describe('enlace DGI solo visual', () => {
  it('guarda parámetros de rotulado sin credenciales ni extremos', () => {
    expect(defaultAjustes.dgiEnlace).toMatchObject({
      mostrarPanel: true, estadoVisual: 'SIN_ENLACE', ambienteVisual: 'NO_APLICA'
    })
    expect(Object.keys(defaultAjustes.dgiEnlace).every(
      (clave) => !/url|token|endpoint|cert|password|clave/i.test(clave)
    )).toBe(true)

    const guardado = ajustesSaveSchema.parse({
      grupo: 'dgiEnlace',
      datos: {
        ...defaultAjustes.dgiEnlace,
        estadoVisual: 'EN_PREPARACION', ambienteVisual: 'PRUEBAS',
        notaInformativa: 'Solo demostración visual.'
      }
    })
    expect(guardado.grupo).toBe('dgiEnlace')
    expect(dgiEnlaceVisualSchema.safeParse({
      ...defaultAjustes.dgiEnlace, estadoVisual: 'CONECTADO'
    }).success).toBe(false)
    expect(dgiEnlaceVisualSchema.safeParse({
      ...defaultAjustes.dgiEnlace, ambienteVisual: 'PRODUCCION_REAL'
    }).success).toBe(false)
  })

  it('no registra canales IPC de emisión ni llamadas externas en el código DGI', () => {
    const leer = (ruta: string): string => readFileSync(resolve(process.cwd(), ruta), 'utf-8')
    const router = leer('src/main/ipc/router.ts')
    expect(router).not.toMatch(/['"`]dgi(?:i)?[._-]/i)

    const archivosVisuales = [
      'src/main/db/migrations/015_dgi_enlace_visual.ts',
      'src/renderer/src/features/ventas/FacturacionEcfPanel.tsx'
    ]
    for (const archivo of archivosVisuales) {
      expect(leer(archivo)).not.toMatch(/fetch\s*\(|https?:\/\/|XMLHttpRequest|axios/)
    }
  })
})
