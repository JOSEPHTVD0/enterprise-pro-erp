import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { seedCompany } from '../../src/main/db/seed'
import type { SessionContext } from '@shared/session'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC')
  return { db, ctx: login.context as SessionContext, maestros: createMaestrosService(db) }
}

const cliente = (codigo: string, nombre: string) => ({
  codigo, nombre, tipo: 'EMPRESA', rncCedula: '123456789', telefono: '8095550000',
  email: 'cliente@ejemplo.com', direccion: 'Av. Independencia', limiteCreditoCent: 500000,
  condicionPagoDias: 15, observaciones: '', activo: true
})

async function xlsx(headers: string[], rows: unknown[][] = []): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Maestros')
  ws.addRow(headers)
  for (const fila of rows) ws.addRow(fila)
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
}

const producto = (codigo: string, extra: Record<string, unknown> = {}) => ({
  codigo, descripcion: 'Producto de prueba', tipo: 'FISICO', precio1Cent: 125000,
  precioMinimoCent: 100000, precio2Cent: 0, precio3Cent: 0, precioMayoristaCent: 0,
  costoPromedioCent: 80000, costoUltimaCompraCent: 0, existenciaMin: 0,
  existenciaMax: 0, manejaSerie: false, manejaLote: false, activo: true, ...extra
})

describe('Fase 4 — maestros', () => {
  it('la migración 002 crea todas las tablas de maestros', () => {
    const db = testDb()
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    for (const t of ['clientes', 'proveedores', 'productos', 'categorias', 'marcas', 'unidades_medida', 'listas_precio', 'vendedores', 'historial_precios']) {
      expect(tables).toContain(t)
    }
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })

  it('crea, lista, edita y elimina lógicamente un cliente con auditoría', () => {
    const { db, ctx, maestros } = setup()
    const { id } = maestros.save(ctx, 'clientes', cliente('CLI-001', 'Cliente Uno')) as { id: number }
    const filas = maestros.list(ctx, { entidad: 'clientes' }) as Record<string, unknown>[]
    expect(filas).toHaveLength(1)
    expect(filas[0].codigo).toBe('CLI-001')
    expect(filas[0].limiteCreditoCent).toBe(500000)

    maestros.save(ctx, 'clientes', { ...cliente('CLI-001', 'Cliente Renombrado'), id })
    expect((maestros.get(ctx, 'clientes', id) as Record<string, unknown>).nombre).toBe('Cliente Renombrado')

    maestros.remove(ctx, 'clientes', id)
    expect((maestros.list(ctx, { entidad: 'clientes', incluirInactivos: false }) as unknown[])).toHaveLength(0)
    const audit = db.prepare("SELECT operacion FROM auditoria WHERE entidad = 'clientes' ORDER BY id").all() as { operacion: string }[]
    expect(audit.map((a) => a.operacion)).toEqual(['CREAR', 'MODIFICAR', 'ELIMINAR'])
    db.close()
  })

  it('rechaza códigos duplicados dentro de la misma empresa', () => {
    const { db, ctx, maestros } = setup()
    maestros.save(ctx, 'clientes', cliente('CLI-DUP', 'Cliente A'))
    expect(() => maestros.save(ctx, 'clientes', cliente('CLI-DUP', 'Cliente B'))).toThrowError(/Ya existe/)
    db.close()
  })

  it('registra cada cambio de precio y respeta el permiso productos.precio', () => {
    const { db, ctx, maestros } = setup()
    const { id } = maestros.save(ctx, 'productos', producto('PRO-001')) as { id: number }
    let hist = maestros.historialPrecios(ctx, id) as Record<string, unknown>[]
    expect(hist.length).toBeGreaterThanOrEqual(2)

    maestros.save(ctx, 'productos', { ...producto('PRO-001', { precio1Cent: 135000 }), id })
    hist = maestros.historialPrecios(ctx, id) as Record<string, unknown>[]
    expect(hist[0]).toMatchObject({ campo: 'precio1Cent', valor_anterior_cent: 125000, valor_nuevo_cent: 135000 })

    const sinPrecio: SessionContext = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'productos.precio') }
    expect(() => maestros.save(sinPrecio, 'productos', { ...producto('PRO-001', { precio1Cent: 999 }), id })).toThrowError()
    expect(() => maestros.historialPrecios(sinPrecio, id)).toThrowError()
    db.close()
  })

  it('oculta los costos del listado cuando el perfil no tiene productos.costo', () => {
    const { db, ctx, maestros } = setup()
    maestros.save(ctx, 'productos', producto('PRO-COSTO'))
    const sinCosto: SessionContext = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'productos.costo') }
    const filas = maestros.list(sinCosto, { entidad: 'productos' }) as Record<string, unknown>[]
    expect(filas[0].precio1Cent).toBe(125000)
    expect(filas[0]).not.toHaveProperty('costoPromedioCent')
    db.close()
  })

  it('valida referencias y bloquea desactivar un catálogo en uso', () => {
    const { db, ctx, maestros } = setup()
    const { id: categoriaId } = maestros.save(ctx, 'categorias', { nombre: 'Bebidas', activo: true }) as { id: number }
    expect(() => maestros.save(ctx, 'productos', producto('PRO-FK', { categoriaId: 99999 }))).toThrowError(/no existe/)

    const { id: productoId } = maestros.save(ctx, 'productos', producto('PRO-FK', { categoriaId })) as { id: number }
    expect(() => maestros.status(ctx, 'categorias', categoriaId, false)).toThrowError(/referenciado/)
    expect(() => maestros.status(ctx, 'productos', productoId, false)).not.toThrow()
    db.close()
  })

  it('aísla los maestros por empresa', () => {
    const { db, ctx, maestros } = setup()
    maestros.save(ctx, 'clientes', cliente('CLI-EMP1', 'Cliente Empresa 1'))
    db.prepare(`
      INSERT INTO empresas (id, nombre_comercial, razon_social, moneda_base)
      VALUES (2, 'OTRA EMPRESA', 'OTRA EMPRESA', 'DOP')
    `).run()
    seedCompany(db, 2)
    const otraEmpresa: SessionContext = { ...ctx, empresaId: 2 }
    expect(maestros.list(otraEmpresa, { entidad: 'clientes' })).toEqual([])
    db.close()
  })

  it('exporta y genera plantillas Excel con las columnas canónicas', async () => {
    const { db, ctx, maestros } = setup()
    maestros.save(ctx, 'clientes', cliente('CLI-XLS-1', 'Excel Uno'))
    const exportado = await maestros.exportar(ctx, 'clientes') as { filename: string; base64: string }
    expect(exportado.filename).toMatch(/^clientes_\d{4}-\d{2}-\d{2}\.xlsx$/)

    const wb = new ExcelJS.Workbook()
    const buf = Buffer.from(exportado.base64, 'base64') as unknown as Parameters<typeof wb.xlsx.load>[0]
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    expect(ws.getRow(1).getCell(1).value).toBe('Código')
    expect(ws.getRow(2).getCell(1).value).toBe('CLI-XLS-1')

    const plantilla = await maestros.plantilla(ctx, 'clientes') as { base64: string }
    const wbPlantilla = new ExcelJS.Workbook()
    const bufPlantilla = Buffer.from(plantilla.base64, 'base64') as unknown as Parameters<typeof wbPlantilla.xlsx.load>[0]
    await wbPlantilla.xlsx.load(bufPlantilla)
    expect(wbPlantilla.worksheets[0].rowCount).toBe(1)
    db.close()
  })

  it('importa Excel válido, reporta errores por fila y audita solo lo insertado', async () => {
    const { db, ctx, maestros } = setup()
    maestros.save(ctx, 'clientes', cliente('CLI-XLS-1', 'Excel Uno'))
    const archivo = await xlsx(
      ['Código', 'Nombre / Razón social', 'RNC o cédula', 'Teléfono', 'Activo (1/0)'],
      [
        ['CLI-XLS-1', 'Duplicado en BD', '', '', 1],
        ['CLI-XLS-2', 'Excel Dos', '999', '8095550000', 1],
        ['CLI-XLS-2', 'Duplicado en archivo', '999', '8095550000', 1],
        ['', 'Sin código', '', '', 1],
        ['CLI-XLS-3', 'Excel Tres', '888', '8095551111', 0]
      ]
    )
    const resultado = await maestros.importar(ctx, 'clientes', archivo) as {
      insertados: number
      errores: { fila: number; mensaje: string }[]
    }
    expect(resultado.insertados).toBe(2)
    expect(resultado.errores).toHaveLength(3)

    const codigos = (maestros.list(ctx, { entidad: 'clientes' }) as Record<string, unknown>[])
      .map((f) => String(f.codigo)).sort()
    expect(codigos).toEqual(['CLI-XLS-1', 'CLI-XLS-2', 'CLI-XLS-3'])
    const audit = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad = 'clientes' AND operacion = 'IMPORTAR'").get() as { n: number }
    expect(audit.n).toBe(2)
    db.close()
  })

  it('no exporta costos sin el permiso productos.costo', async () => {
    const { db, ctx, maestros } = setup()
    maestros.save(ctx, 'productos', producto('PRO-XLS'))
    const sinCosto: SessionContext = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'productos.costo') }
    const exportado = await maestros.exportar(sinCosto, 'productos') as { base64: string }
    const wb = new ExcelJS.Workbook()
    const buf = Buffer.from(exportado.base64, 'base64') as unknown as Parameters<typeof wb.xlsx.load>[0]
    await wb.xlsx.load(buf)
    const cabeceras = wb.worksheets[0].getRow(1).values as string[]
    expect(cabeceras).not.toContain('Costo promedio (centavos)')
    expect(cabeceras).toContain('Precio 1 (centavos)')
    db.close()
  })

  it('verifica permisos en exportación e importación', async () => {
    const { db, ctx, maestros } = setup()
    const sinExportar: SessionContext = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'clientes.exportar') }
    await expect(maestros.exportar(sinExportar, 'clientes')).rejects.toThrow()
    const sinCrear: SessionContext = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'clientes.crear') }
    const archivo = await xlsx(['Código', 'Nombre / Razón social'], [['CLI-P', 'Cliente']])
    await expect(maestros.importar(sinCrear, 'clientes', archivo)).rejects.toThrow()
    db.close()
  })

  it('verifica permisos en el backend para cada operación', () => {
    const { db, ctx, maestros } = setup()
    const sinConsultar: SessionContext = { ...ctx, permisos: [] }
    expect(() => maestros.list(sinConsultar, { entidad: 'clientes' })).toThrowError()
    expect(() => maestros.save(sinConsultar, 'clientes', cliente('CLI-X', 'Cliente X'))).toThrowError()
    expect(() => maestros.remove(sinConsultar, 'clientes', 1)).toThrowError()
    db.close()
  })
})
