import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD, seedCompany } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC')
  const ctx = login.context as SessionContext
  const maestros = createMaestrosService(db)
  const inventario = createInventarioService(db)
  const almacen2 = Number(db.prepare(`
    INSERT INTO almacenes (empresa_id, codigo, nombre) VALUES (1, 'SECUNDARIO', 'Almacén secundario')
  `).run().lastInsertRowid)

  function producto(codigo: string, extra: Record<string, unknown> = {}): number {
    return (maestros.save(ctx, 'productos', {
      codigo, descripcion: `Producto ${codigo}`, tipo: 'FISICO', precio1Cent: 20000,
      costoPromedioCent: 10000, costoUltimaCompraCent: 0, precio2Cent: 0,
      precio3Cent: 0, precioMayoristaCent: 0, precioMinimoCent: 0,
      existenciaMin: 0, existenciaMax: 0, manejaSerie: false, manejaLote: false,
      activo: true, ...extra
    }) as { id: number }).id
  }

  return { db, ctx, maestros, inventario, almacen2, producto }
}

const sinPermiso = (ctx: SessionContext, clave: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((p) => p !== clave)
})

describe('Fase 5 — inventario', () => {
  it('la migración 003 crea las tablas y protege el kardex contra cambios', () => {
    const { db, ctx, inventario, producto } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    for (const t of [
      'existencias', 'movimientos_inventario', 'transferencias', 'transferencia_lineas',
      'ajustes_inventario', 'ajuste_lineas', 'series_producto', 'lotes_producto', 'costos_historial'
    ]) expect(tablas).toContain(t)

    const migraciones = (db.prepare('SELECT version FROM _migraciones ORDER BY version').all() as { version: number }[]).map((m) => m.version)
    expect(migraciones).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

    const id = producto('PRO-KARDEX')
    const { id: movimientoId } = inventario.movimiento(ctx, {
      productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 1,
      costoUnitCent: 100, motivo: 'Alta', referencia: ''
    }) as { id: number }
    expect(() => db.prepare('UPDATE movimientos_inventario SET cantidad = 99 WHERE id = ?').run(movimientoId)).toThrow(/inmutable/)
    expect(() => db.prepare('DELETE FROM movimientos_inventario WHERE id = ?').run(movimientoId)).toThrow(/inmutable/)
    db.close()
  })

  it('una entrada valorada actualiza existencia, kardex, costo y auditoría', () => {
    const { db, ctx, inventario, maestros, producto } = setup()
    const id = producto('PRO-ENTRADA')
    expect(inventario.movimiento(ctx, {
      productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 10,
      costoUnitCent: 10000, motivo: 'Compra inicial', referencia: 'OC-001'
    })).toHaveProperty('id')

    const ex = (inventario.existencias(ctx, { productoId: id }) as Fila[])[0]
    expect(ex.cantidad).toBe(10)
    expect(ex.valorCent).toBe(100000)

    const kardex = inventario.kardex(ctx, { productoId: id }) as Fila[]
    expect(kardex).toHaveLength(1)
    expect(kardex[0]).toMatchObject({ tipo: 'COMPRA', cantidad: 10, saldoCantidad: 10, saldoCostoCent: 100000 })
    expect((maestros.get(ctx, 'productos', id) as Fila).costoPromedioCent).toBe(10000)
    const audit = db.prepare("SELECT operacion FROM auditoria WHERE entidad = 'movimientos_inventario'").all() as Fila[]
    expect(audit.map((a) => a.operacion)).toEqual(['CREAR'])
    db.close()
  })

  it('recalcula el promedio con entradas y no con salidas', () => {
    const { db, ctx, inventario, maestros, producto } = setup()
    // Costo inicial 0 para que ambas compras dejen constancia en el historial.
    const id = producto('PRO-PROMEDIO', { costoPromedioCent: 0 })
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 10, costoUnitCent: 10000, motivo: 'Compra 1', referencia: '' })
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 10, costoUnitCent: 20000, motivo: 'Compra 2', referencia: '' })
    expect((maestros.get(ctx, 'productos', id) as Fila).costoPromedioCent).toBe(15000)
    expect((inventario.existencias(ctx, { productoId: id }) as Fila[])[0].valorCent).toBe(300000)

    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'AJUSTE_SALIDA', cantidad: -5, costoUnitCent: 0, motivo: 'Mermas', referencia: '' })
    expect((maestros.get(ctx, 'productos', id) as Fila).costoPromedioCent).toBe(15000)
    expect((inventario.existencias(ctx, { productoId: id }) as Fila[])[0]).toMatchObject({ cantidad: 15, valorCent: 225000 })
    const historial = inventario.costos(ctx, id).historial as Fila[]
    expect(historial).toHaveLength(2)
    expect(historial[0]).toMatchObject({ costoAnteriorCent: 10000, costoNuevoCent: 15000 })
    db.close()
  })

  it('las transferencias generan dos movimientos y conservan el valor', () => {
    const { db, ctx, inventario, almacen2, producto } = setup()
    const id = producto('PRO-TRANSFERIR')
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 20, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 20, costoUnitCent: 20000, motivo: 'Alta 2', referencia: '' })

    const { id: transferenciaId } = inventario.transferencia(ctx, {
      almacenOrigenId: 1, almacenDestinoId: almacen2, motivo: 'Reabastecimiento',
      lineas: [{ productoId: id, cantidad: 4 }]
    }) as { id: number }
    const porAlmacen = Object.fromEntries(
      (inventario.existencias(ctx, { productoId: id }) as Fila[]).map((f) => [Number(f.almacenId), f])
    )
    expect(porAlmacen[1]).toMatchObject({ cantidad: 36, valorCent: 540000 })
    expect(porAlmacen[almacen2]).toMatchObject({ cantidad: 4, valorCent: 60000 })
    expect(540000 + 60000).toBe(600000)

    const movimientos = (inventario.kardex(ctx, { productoId: id }) as Fila[])
      .filter((m) => m.docTipo === 'TRANSFERENCIA')
    expect(movimientos).toHaveLength(2)
    expect(movimientos.map((m) => m.tipo).sort()).toEqual(['TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA'])
    expect((inventario.detalleTransferencia(ctx, transferenciaId).lineas as Fila[])).toHaveLength(1)
    db.close()
  })

  it('un conteo calcula la diferencia entre el saldo y la cantidad física', () => {
    const { db, ctx, inventario, producto } = setup()
    const id = producto('PRO-CONTEO')
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 10, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })
    const { id: ajusteId } = inventario.ajuste(ctx, {
      tipo: 'CONTEO', almacenId: 1, motivo: 'Conteo físico mensual',
      lineas: [{ productoId: id, cantidadNueva: 7 }]
    }) as { id: number }
    expect((inventario.existencias(ctx, { productoId: id }) as Fila[])[0].cantidad).toBe(7)
    const lineas = inventario.detalleAjuste(ctx, ajusteId).lineas as Fila[]
    expect(lineas[0]).toMatchObject({ cantidad: -3, cantidadNueva: 7 })
    const movimiento = (inventario.kardex(ctx, { productoId: id }) as Fila[])[0]
    expect(movimiento).toMatchObject({ tipo: 'CONTEO', cantidad: -3 })
    db.close()
  })

  it('bloquea stock negativo salvo que el parámetro lo permita', () => {
    const { db, ctx, inventario, producto } = setup()
    const id = producto('PRO-NEGATIVO')
    expect(() => inventario.movimiento(ctx, {
      productoId: id, almacenId: 1, tipo: 'AJUSTE_SALIDA', cantidad: -1, costoUnitCent: 0, motivo: 'Salida', referencia: ''
    })).toThrow(/Stock insuficiente/)

    db.prepare(`UPDATE parametros SET valor = 'true' WHERE empresa_id = 1 AND clave = 'permitir_stock_negativo'`).run()
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'AJUSTE_SALIDA', cantidad: -1, costoUnitCent: 0, motivo: 'Salida', referencia: '' })
    expect((inventario.existencias(ctx, { productoId: id }) as Fila[])[0]).toMatchObject({ cantidad: -1, valorCent: 0 })
    db.close()
  })

  it('revierte por completo una transferencia fallida (transacción atómica)', () => {
    const { db, ctx, inventario, producto } = setup()
    const conStock = producto('PRO-ATOMICA-1')
    const sinStock = producto('PRO-ATOMICA-2')
    inventario.movimiento(ctx, { productoId: conStock, almacenId: 1, tipo: 'COMPRA', cantidad: 5, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })
    const serieAntes = (db.prepare("SELECT siguiente FROM series_documento WHERE empresa_id = 1 AND tipo_doc = 'TRANSFERENCIA_INVENTARIO'").get() as { siguiente: number }).siguiente

    expect(() => inventario.transferencia(ctx, {
      almacenOrigenId: 1, almacenDestinoId: 2, motivo: 'Fallará en la segunda línea',
      lineas: [{ productoId: conStock, cantidad: 1 }, { productoId: sinStock, cantidad: 1 }]
    })).toThrow(/Stock insuficiente/)

    expect(db.prepare('SELECT COUNT(*) AS n FROM transferencias').get()).toEqual({ n: 0 })
    expect((inventario.kardex(ctx, { productoId: conStock }) as Fila[]).filter((m) => m.docTipo === 'TRANSFERENCIA')).toHaveLength(0)
    expect((inventario.existencias(ctx, { productoId: conStock }) as Fila[])[0].cantidad).toBe(5)
    const serieDespues = (db.prepare("SELECT siguiente FROM series_documento WHERE empresa_id = 1 AND tipo_doc = 'TRANSFERENCIA_INVENTARIO'").get() as { siguiente: number }).siguiente
    expect(serieDespues).toBe(serieAntes)
    db.close()
  })

  it('anula un ajuste con movimientos inversos sin borrar el kardex', () => {
    const { db, ctx, inventario, producto } = setup()
    const id = producto('PRO-REVERSA')
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 10, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })
    const { id: ajusteId } = inventario.ajuste(ctx, {
      tipo: 'PERDIDA', almacenId: 1, motivo: 'Mercancía perdida',
      lineas: [{ productoId: id, cantidad: -4 }]
    }) as { id: number }
    expect((inventario.existencias(ctx, { productoId: id }) as Fila[])[0].cantidad).toBe(6)
    const antes = (inventario.kardex(ctx, { productoId: id }) as Fila[]).length

    inventario.anularAjuste(ctx, ajusteId)
    expect((inventario.existencias(ctx, { productoId: id }) as Fila[])[0].cantidad).toBe(10)
    expect((inventario.kardex(ctx, { productoId: id }) as Fila[]).length).toBe(antes + 1)
    expect((inventario.detalleAjuste(ctx, ajusteId).cabecera as Fila).estado).toBe('ANULADO')
    expect(() => inventario.anularAjuste(ctx, ajusteId)).toThrow(/ya está anulado/)
    db.close()
  })

  it('verifica permisos y oculta costos sin el permiso específico', () => {
    const { db, ctx, inventario, producto } = setup()
    const id = producto('PRO-PERMIOSOS')
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 2, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })

    expect(() => inventario.movimiento(sinPermiso(ctx, 'inventario.crear'), {
      productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 1, costoUnitCent: 100, motivo: 'Alta', referencia: ''
    })).toThrow(/permiso/i)
    expect(() => inventario.existencias(sinPermiso(ctx, 'inventario.consultar'), {})).toThrow(/permiso/i)

    const sinCosto = sinPermiso(ctx, 'inventario.costo')
    expect((inventario.existencias(sinCosto, { productoId: id }) as Fila[])[0]).not.toHaveProperty('valorCent')
    expect((inventario.kardex(sinCosto, { productoId: id }) as Fila[])[0]).not.toHaveProperty('costoTotalCent')
    expect(() => inventario.costos(sinCosto, id)).toThrow(/permiso/i)
    db.close()
  })

  it('aísla los datos por empresa', () => {
    const { db, ctx, inventario, producto } = setup()
    const id = producto('PRO-EMPRESA-1')
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 10, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })
    db.prepare(`
      INSERT INTO empresas (id, nombre_comercial, razon_social, moneda_base)
      VALUES (2, 'EMPRESA 2', 'EMPRESA 2', 'DOP')
    `).run()
    seedCompany(db, 2)
    const ctx2: SessionContext = { ...ctx, empresaId: 2 }

    expect(inventario.existencias(ctx2, {})).toEqual([])
    expect(inventario.kardex(ctx2, {})).toEqual([])
    expect(() => inventario.movimiento(ctx2, {
      productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 1, costoUnitCent: 100, motivo: 'Alta', referencia: ''
    })).toThrow(/Producto no encontrado/)
    db.close()
  })

  it('registra series y lotes solo para productos configurados', () => {
    const { db, ctx, inventario, producto } = setup()
    const serializado = producto('PRO-SERIE', { manejaSerie: true, manejaLote: true })
    const simple = producto('PRO-SIMPLE')

    expect(inventario.crearSerie(ctx, { productoId: serializado, serie: 'SER-001' })).toHaveProperty('id')
    expect(inventario.crearLote(ctx, { productoId: serializado, lote: 'LOTE-A', vencimiento: '2027-01-31', cantidad: 5 })).toHaveProperty('id')
    expect(inventario.series(ctx, serializado)).toHaveLength(1)
    expect(inventario.lotes(ctx, serializado)).toHaveLength(1)
    expect(() => inventario.crearSerie(ctx, { productoId: simple, serie: 'X' })).toThrow(/no está configurado/)
    expect(() => inventario.crearLote(ctx, { productoId: simple, lote: 'X' })).toThrow(/no está configurado/)
    db.close()
  })

  it('exporta existencias y kardex a un Excel real', async () => {
    const { db, ctx, inventario, producto } = setup()
    const id = producto('PRO-EXCEL')
    inventario.movimiento(ctx, { productoId: id, almacenId: 1, tipo: 'COMPRA', cantidad: 3, costoUnitCent: 10000, motivo: 'Alta', referencia: '' })

    const res = await inventario.exportar(ctx, 'existencias', {})
    expect(res.filename).toMatch(/^existencias_\d{4}-\d{2}-\d{2}\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(res.base64, 'base64') as unknown as Parameters<typeof wb.xlsx.load>[0])
    expect(String(wb.worksheets[0].getCell('A1').value)).toBe('Código')
    expect(String(wb.worksheets[0].getCell('B2').value)).toContain('PRO-EXCEL')

    const kardex = await inventario.exportar(ctx, 'kardex', { limite: 100 })
    expect(kardex.filename).toMatch(/^kardex_/)
    db.close()
  })
})
