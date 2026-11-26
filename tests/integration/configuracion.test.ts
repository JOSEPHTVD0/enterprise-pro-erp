import { describe, it, expect } from 'vitest'
import { testDb } from '../helpers/db'
import { createAuthService } from '../../src/main/services/auth.service'
import { createConfiguracionService, libroHabilitado } from '../../src/main/services/configuracion.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { defaultAjustes } from '@shared/schemas/ajustes'
import { createSeguridadService } from '../../src/main/services/seguridad.service'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { nextSerieNumber } from '../../src/main/repositories/configuracion.repo'

function admin(db: ReturnType<typeof testDb>) {
  const auth = createAuthService(db)
  const res = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC')
  return { auth, config: createConfiguracionService(db), seguridad: createSeguridadService(db), ctx: res.context!, db }
}

describe('configuración y numeración', () => {
  it('lee configuraciónreal desde SQLite', () => {
    const { config, ctx, db } = admin(testDb())
    const cfg = config.getConfig(ctx)
    expect(cfg.empresa).toBeTruthy()
    expect(cfg.parametros.permitir_stock_negativo).toBe('false')
    expect(cfg.impuestos.some((i) => i.codigo === 'ITBIS18')).toBe(true)
    expect(cfg.series.length).toBeGreaterThanOrEqual(15)
    db.close()
  })

  it('guarda empresa con RNC y la marca como configurada', () => {
    const { config, ctx, db } = admin(testDb())
    config.saveEmpresa(ctx, {
      id: 1,
      nombreComercial: 'Comercial prueba', razonSocial: 'Comercial prueba SRL', rnc: '123456789',
      cedula: '', direccion: 'Calle 1', telefonos: '', email: '', monedaBase: 'DOP', activa: true
    })
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = 1').get() as { rnc: string; configurada: number }
    expect(empresa.rnc).toBe('123456789')
    expect(empresa.configurada).toBe(1)
    db.close()
  })

  it('rechaza RNC duplicado entre empresas', () => {
    const { config, ctx, db } = admin(testDb())
    const input = {
      nombreComercial: 'Empresa A', razonSocial: 'Empresa A SRL', rnc: '999888777',
      cedula: '', direccion: 'Calle 2', telefonos: '', email: '', monedaBase: 'DOP', activa: true
    }
    config.saveEmpresa(ctx, input)
    expect(() => config.saveEmpresa(ctx, { ...input, nombreComercial: 'Empresa B' })).toThrowError('Ya existe otra empresa')
    db.close()
  })

  it('la vista previa no consume y la reserva centralizada es consecutiva', () => {
    const { config, ctx, db } = admin(testDb())
    const preview = config.vistaPreviaNumero(ctx, 'FACTURA_CONTADO').numero
    expect(config.reservarNumero(ctx, 'FACTURA_CONTADO').numero).toBe(preview)
    expect(nextSerieNumber(db, 1, 'FACTURA_CONTADO')).toBe('FAC-00000001')
    expect(nextSerieNumber(db, 1, 'FACTURA_CONTADO')).toBe('FAC-00000002')
    expect(config.vistaPreviaNumero(ctx, 'COTIZACION').numero).toMatch(/^COT-/)
    db.close()
  })

  it('graba auditoría dentro de la misma transacción de cada cambio', () => {
    const { config, ctx, db } = admin(testDb())
    config.setParametro(ctx, 'itbis_por_defecto', 'EXENTO')
    const rows = db.prepare("SELECT operacion, entidad FROM auditoria WHERE operacion = 'MODIFICAR'").all()
    expect(rows).toEqual([{ operacion: 'MODIFICAR', entidad: 'parametros' }])
    db.close()
  })

  it('aísla la configuración por empresa (multi-empresa)', () => {
    const { config, ctx, db } = admin(testDb())
    const nueva = config.saveEmpresa(ctx, {
      nombreComercial: 'Segunda empresa', razonSocial: 'Segunda SRL', rnc: '',
      cedula: '', direccion: '', telefonos: '', email: '', monedaBase: 'DOP', activa: true
    })
    config.setParametro(ctx, 'separador_decimal', ',')
    const params2 = db.prepare('SELECT valor FROM parametros WHERE empresa_id = ? AND clave = ?').get(nueva.id, 'separador_decimal') as { valor: string }
    expect(params2.valor).toBe('.')
    expect(db.prepare('SELECT 1 FROM roles WHERE empresa_id = ?').get(nueva.id)).toBeTruthy()
    db.close()
  })

  it('registra tasa de cambio y formato de impresión', () => {
    const { config, ctx, db } = admin(testDb())
    db.prepare("INSERT INTO monedas (empresa_id, codigo, nombre, simbolo) VALUES (1, 'USD', 'Dólar', 'US$')").run()
    config.saveTasaCambio(ctx, { monedaCodigo: 'USD', tasa: 60.5, fecha: '2026-11-23' })
    config.saveFormato(ctx, { tipoDoc: 'POS', formato: 'TICKET_80', copias: 1 })
    expect((db.prepare('SELECT tasa FROM tasas_cambio WHERE moneda_codigo = ?').get('USD') as { tasa: number }).tasa).toBe(60.5)
    expect((db.prepare("SELECT formato FROM formatos_impresion WHERE tipo_doc = 'POS'").get() as { formato: string }).formato).toBe('TICKET_80')
    db.close()
  })

  it('el administrador puede listar sesiones y auditoría', () => {
    const { seguridad, ctx, db } = admin(testDb())
    expect(seguridad.listSessions(ctx).length).toBeGreaterThan(0)
    expect(Array.isArray(seguridad.listAudit(ctx, {}))).toBe(true)
    db.close()
  })
})

describe('ajustes fiscales e integraciones aplicados en backend', () => {
  it('sincroniza itbis, moneda y aviso de NCF con las tablas operativas', () => {
    const { ctx, db } = admin(testDb())
    createAjustesService(db).save(ctx, {
      grupo: 'fiscal',
      datos: {
        ...defaultAjustes.fiscal,
        itbisPorDefecto: 'EXENTO', monedaBase: 'USD', ncfAvisoDias: 30
      }
    })
    expect(db.prepare(`
      SELECT valor FROM parametros WHERE empresa_id = 1 AND clave = 'itbis_por_defecto'
    `).get()).toEqual({ valor: 'EXENTO' })
    expect(db.prepare('SELECT moneda_base FROM empresas WHERE id = 1').get())
      .toEqual({ moneda_base: 'USD' })
    expect((db.prepare(`
      SELECT alerta_min FROM series_documento WHERE empresa_id = 1 ORDER BY id LIMIT 1
    `).get() as { alerta_min: number }).alerta_min).toBe(30)
    expect(db.prepare(`
      SELECT COUNT(*) AS n FROM auditoria WHERE operacion = 'SINCRONIZAR_FISCAL'
    `).get()).toMatchObject({ n: 1 })
    db.close()
  })

  it('libro606 y libro607 gobiernan su generación', () => {
    const { ctx, db } = admin(testDb())
    const ajustes = createAjustesService(db)
    ajustes.save(ctx, {
      grupo: 'fiscal',
      datos: { ...defaultAjustes.fiscal, libro606: false, libro607: true }
    })
    expect(libroHabilitado(db, 1, 'LIBRO606')).toBe(false)
    expect(libroHabilitado(db, 1, 'LIBRO607')).toBe(true)
    ajustes.save(ctx, {
      grupo: 'fiscal',
      datos: { ...defaultAjustes.fiscal, libro606: true, libro607: false }
    })
    expect(libroHabilitado(db, 1, 'LIBRO606')).toBe(true)
    expect(libroHabilitado(db, 1, 'LIBRO607')).toBe(false)
    db.close()
  })

  it('solo ofrece formatos que el backend produce y habilita la estación', () => {
    const { config, ctx, db } = admin(testDb())
    createAjustesService(db).save(ctx, {
      grupo: 'integraciones',
      datos: { ...defaultAjustes.integraciones, formatos: ['CSV'], impresoraTicket: 'POS-TICKET' }
    })
    const cfg = config.getConfig(ctx)
    expect(cfg.formatosExportacion).toEqual(['CSV'])
    expect(cfg.impresoraTicketEfectiva).toBe('POS-TICKET')
    db.close()
  })
})
