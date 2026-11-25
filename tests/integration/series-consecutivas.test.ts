import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createConfiguracionService } from '../../src/main/services/configuracion.service'
import { createModulos2026Service } from '../../src/main/services/modulos2026.service'
import { createSaludService } from '../../src/main/services/salud.service'
import {
  alertasSeries, numerarConsecutivo, vistaPreviaSerie
} from '../../src/main/repositories/series.repo'
import { nextSerieNumber } from '../../src/main/repositories/configuracion.repo'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC').context as SessionContext
  return { db, ctx, config: createConfiguracionService(db), modulos: createModulos2026Service(db), salud: createSaludService(db) }
}

describe('v0.4.0 — series consecutivas sin saltos', () => {
  it('genera prefijo + correlativo continuo con ceros a la izquierda', () => {
    const { db } = setup()
    expect(numerarConsecutivo(db, 1, 'FACTURA_CONTADO').numero).toBe('FAC-00000001')
    expect(numerarConsecutivo(db, 1, 'FACTURA_CONTADO').numero).toBe('FAC-00000002')
    expect(nextSerieNumber(db, 1, 'FACTURA_CONTADO')).toBe('FAC-00000003')
    expect(numerarConsecutivo(db, 1, 'ORDEN_COMPRA').numero).toBe('OC-00000001')
    db.close()
  })

  it('la vista previa no consume el correlativo', () => {
    const { db } = setup()
    expect(vistaPreviaSerie(db, 1, 'COTIZACION').numero).toBe('COT-00000001')
    expect(vistaPreviaSerie(db, 1, 'COTIZACION').numero).toBe('COT-00000001')
    expect(numerarConsecutivo(db, 1, 'COTIZACION').numero).toBe('COT-00000001')
    db.close()
  })

  it('un rollback no deja hueco en la secuencia', () => {
    const { db } = setup()
    expect(() => db.transaction(() => {
      numerarConsecutivo(db, 1, 'PEDIDO')
      throw new Error('fallo simulado después de reservar')
    })()).toThrow('fallo simulado')
    expect(numerarConsecutivo(db, 1, 'PEDIDO').numero).toBe('PED-00000001')
    expect(numerarConsecutivo(db, 1, 'PEDIDO').numero).toBe('PED-00000002')
    db.close()
  })

  it('una serie inactiva o vencida rechaza la reserva sin avanzar el contador', () => {
    const { db } = setup()
    db.prepare(`UPDATE series_documento SET activa = 0 WHERE empresa_id = 1 AND tipo_doc = 'POS'`).run()
    expect(() => numerarConsecutivo(db, 1, 'POS')).toThrow(/inactiva/)
    db.prepare(`UPDATE series_documento SET activa = 1, es_ncf = 1, vence_en = '2020-01-01' WHERE empresa_id = 1 AND tipo_doc = 'POS'`).run()
    expect(() => numerarConsecutivo(db, 1, 'POS', { fecha: '2026-11-24' })).toThrow(/vencida/)
    db.prepare(`UPDATE series_documento SET es_ncf = 0, vence_en = '' WHERE empresa_id = 1 AND tipo_doc = 'POS'`).run()
    expect(numerarConsecutivo(db, 1, 'POS').numero).toBe('POS-00000001')
    db.close()
  })

  it('bloquea cambios de prefijo, longitud y correlativo cuando ya hay movimientos', () => {
    const { db, ctx, config } = setup()
    numerarConsecutivo(db, 1, 'GASTO')
    const serie = db.prepare(`SELECT * FROM series_documento WHERE empresa_id = 1 AND tipo_doc = 'GASTO'`).get() as Fila
    expect(() => config.saveCatalog(ctx, 'series_documento', { ...serie, prefijo: 'XX-' })).toThrow(/prefijo/)
    expect(() => config.saveCatalog(ctx, 'series_documento', { ...serie, longitud: 6 })).toThrow(/longitud/)
    expect(() => config.saveCatalog(ctx, 'series_documento', { ...serie, siguiente: 99 })).toThrow(/correlativo/)
    db.close()
  })

  it('los módulos 2026 usan el mismo numerador central', () => {
    const { db, ctx, modulos } = setup()
    const uno = modulos.presupuestoCrear(ctx, {
      nombre: 'Plan A', periodo: '2027-01', observaciones: '', lineas: []
    }) as { numero: string }
    const dos = modulos.presupuestoCrear(ctx, {
      nombre: 'Plan B', periodo: '2027-02', observaciones: '', lineas: []
    }) as { numero: string }
    expect(uno.numero).toBe('PRE-00000001')
    expect(dos.numero).toBe('PRE-00000002')
    db.close()
  })

  it('el panel de salud avisa de series agotadas o próximas a agotarse', () => {
    const { db, ctx, salud } = setup()
    db.prepare(`UPDATE series_documento SET rango_hasta = '2', alerta_min = 3 WHERE empresa_id = 1 AND tipo_doc = 'CONDUCE'`).run()
    expect(alertasSeries(db, 1).find((s) => s.tipoDoc === 'CONDUCE')?.estado).toBe('ALERTA')
    const resumen = salud.resumen(ctx) as { comprobaciones: { nombre: string; estado: string }[] }
    expect(resumen.comprobaciones.find((c) => c.nombre === 'Series consecutivas')?.estado).toBe('advertencia')
    db.close()
  })
})
