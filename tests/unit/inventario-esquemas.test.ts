import { describe, it, expect } from 'vitest'
import {
  movimientoSchema, ajusteSchema, transferenciaSchema,
  existenciasFiltroSchema, kardexFiltroSchema, serieProductoSchema
} from '../../src/shared/schemas/inventario'

describe('Fase 5 — esquemas de inventario', () => {
  it('exige que el signo de la cantidad coincida con el tipo de movimiento', () => {
    expect(movimientoSchema.safeParse({
      productoId: 1, almacenId: 1, tipo: 'COMPRA', cantidad: 2
    }).success).toBe(true)
    expect(movimientoSchema.safeParse({
      productoId: 1, almacenId: 1, tipo: 'COMPRA', cantidad: -2
    }).success).toBe(false)
    expect(movimientoSchema.safeParse({
      productoId: 1, almacenId: 1, tipo: 'PERDIDA', cantidad: -2
    }).success).toBe(true)
    expect(movimientoSchema.safeParse({
      productoId: 1, almacenId: 1, tipo: 'PERDIDA', cantidad: 2
    }).success).toBe(false)
  })

  it('valida la coherencia de ajustes y conteos', () => {
    expect(ajusteSchema.safeParse({
      tipo: 'CONTEO', almacenId: 1, motivo: 'Conteo mensual',
      lineas: [{ productoId: 1 }]
    }).success).toBe(false)
    expect(ajusteSchema.safeParse({
      tipo: 'CONTEO', almacenId: 1, motivo: 'Conteo mensual',
      lineas: [{ productoId: 1, cantidadNueva: 5 }]
    }).success).toBe(true)
    expect(ajusteSchema.safeParse({
      tipo: 'DANIO', almacenId: 1, motivo: 'Mercancía dañada',
      lineas: [{ productoId: 1, cantidad: 2 }]
    }).success).toBe(false)
  })

  it('impide transferencias entre el mismo almacén', () => {
    expect(transferenciaSchema.safeParse({
      almacenOrigenId: 1, almacenDestinoId: 1,
      lineas: [{ productoId: 1, cantidad: 1 }]
    }).success).toBe(false)
    expect(transferenciaSchema.safeParse({
      almacenOrigenId: 1, almacenDestinoId: 2,
      lineas: [{ productoId: 1, cantidad: 1 }]
    }).success).toBe(true)
  })

  it('aplica valores por defecto a filtros y series', () => {
    expect(existenciasFiltroSchema.parse(undefined)).toEqual({})
    expect(kardexFiltroSchema.parse(undefined).limite).toBe(300)
    expect(serieProductoSchema.parse({ productoId: 1, serie: '  ABC-1  ' }).serie).toBe('ABC-1')
  })
})
