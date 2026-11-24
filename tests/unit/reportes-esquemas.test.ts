import { describe, expect, it } from 'vitest'
import {
  reportesConsultaSchema, reportesExportarSchema, reportesFiltroSchema,
  reportesImprimirSchema, reportesSerieSchema
} from '@shared/schemas/reportes'

describe('esquemas de reportes (Fase 9)', () => {
  it('acepta los ocho reportes del catálogo', () => {
    const parsed = reportesConsultaSchema.parse({ reporte: 'LIBRO606' })
    expect(parsed.reporte).toBe('LIBRO606')
    expect(() => reportesConsultaSchema.parse({ reporte: 'INEBISTIBLE' })).toThrow()
  })

  it('aplica límites y fechas válidas en el filtro', () => {
    expect(reportesFiltroSchema.parse({}).limite).toBe(300)
    expect(reportesFiltroSchema.parse({ fechaDesde: '2026-01-01' }).fechaDesde).toBe('2026-01-01')
    expect(() => reportesFiltroSchema.parse({ fechaHasta: '01-01-2026' })).toThrow()
    expect(() => reportesFiltroSchema.parse({ limite: 0 })).toThrow()
  })

  it('la serie usa granularidad diaria por defecto y rechaza valores desconocidos', () => {
    expect(reportesSerieSchema.parse({}).granularidad).toBe('DIA')
    expect(reportesSerieSchema.parse({ granularidad: 'MES' }).granularidad).toBe('MES')
    expect(() => reportesSerieSchema.parse({ granularidad: 'SEMANA' })).toThrow()
  })

  it('exporta solo reportes detallados en XLSX o CSV', () => {
    expect(reportesExportarSchema.parse({ reporte: 'VENTAS' }).formato).toBe('XLSX')
    expect(reportesExportarSchema.parse({ reporte: 'CXP', formato: 'CSV' }).formato).toBe('CSV')
    expect(() => reportesExportarSchema.parse({ reporte: 'RESUMEN' })).toThrow()
    expect(() => reportesExportarSchema.parse({ reporte: 'VENTAS', formato: 'PDF' })).toThrow()
  })

  it('la impresión exige un reporte detallado', () => {
    expect(reportesImprimirSchema.parse({ reporte: 'LIBRO607' }).reporte).toBe('LIBRO607')
    expect(() => reportesImprimirSchema.parse({})).toThrow()
    expect(() => reportesImprimirSchema.parse({ reporte: 'RESUMEN' })).toThrow()
  })
})
