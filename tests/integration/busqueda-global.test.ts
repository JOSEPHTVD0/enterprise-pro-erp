import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD, seedCompany } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createBusquedaService } from '../../src/main/services/busqueda.service'
import { busquedaGlobalSchema } from '@shared/schemas/busqueda'
import type { SessionContext } from '@shared/session'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC')
  const ctx = login.context as SessionContext
  const maestros = createMaestrosService(db)
  const busqueda = createBusquedaService(db)
  return { db, ctx, maestros, busqueda }
}

const cliente = (codigo: string, nombre: string) => ({
  codigo, nombre, tipo: 'EMPRESA', rncCedula: '123456789', telefono: '8095550000',
  email: 'cliente@ejemplo.com', direccion: 'Av. Independencia', limiteCreditoCent: 0,
  condicionPagoDias: 0, observaciones: '', activo: true
})

const producto = (codigo: string, descripcion: string) => ({
  codigo, descripcion, tipo: 'FISICO', precio1Cent: 100, precioMinimoCent: 0,
  precio2Cent: 0, precio3Cent: 0, precioMayoristaCent: 0, costoPromedioCent: 50,
  costoUltimaCompraCent: 0, existenciaMin: 0, existenciaMax: 0,
  manejaSerie: false, manejaLote: false, activo: true
})

describe('búsqueda global por entidades', () => {
  it('busca clientes y productos con los permisos de la sesión', () => {
    const { db, ctx, maestros, busqueda } = setup()
    maestros.save(ctx, 'clientes', cliente('CLI-001', 'Cliente Principal'))
    maestros.save(ctx, 'productos', producto('A-01', 'Aceite principal'))

    const resultados = busqueda.global(ctx, busquedaGlobalSchema.parse({ texto: 'principal', limite: 20 }))
    expect(resultados.map((r) => r.entidad).sort()).toEqual(['clientes', 'productos'])
    expect(resultados.find((r) => r.entidad === 'productos')).toMatchObject({
      titulo: 'Aceite principal', subtitulo: 'Producto · A-01', vista: 'productos'
    })
    expect(JSON.stringify(resultados)).not.toContain('costoPromedioCent')

    const codigo = busqueda.global(ctx, busquedaGlobalSchema.parse({ texto: 'a-01' }))
    expect(codigo[0]).toMatchObject({ entidad: 'productos', titulo: 'Aceite principal' })
    expect(codigo[0].score).toBeGreaterThan(resultados[0].score)
    db.close()
  })

  it('omite entidades sin permiso y registros inactivos salvo solicitud explícita', () => {
    const { db, ctx, maestros, busqueda } = setup()
    const { id } = maestros.save(ctx, 'clientes', cliente('CLI-OF', 'Cliente Oculto')) as { id: number }
    maestros.save(ctx, 'productos', producto('P-OF', 'Producto Oculto'))
    maestros.status(ctx, 'clientes', id, false)

    const sinProductos: SessionContext = {
      ...ctx, permisos: ctx.permisos.filter((permiso) => permiso !== 'productos.consultar')
    }
    expect(busqueda.global(sinProductos, { texto: 'oculto', limite: 10 })).toEqual([])
    expect(busqueda.global(ctx, { texto: 'oculto', limite: 10 }).map((r) => r.entidad)).toEqual(['productos'])
    expect(busqueda.global(ctx, { texto: 'oculto', limite: 10, incluirInactivos: true })
      .map((r) => r.entidad).sort()).toEqual(['clientes', 'productos'])
    db.close()
  })

  it('no mezcla empresas y rechaza consultas demasiado cortas', () => {
    const { db, ctx, maestros, busqueda } = setup()
    maestros.save(ctx, 'clientes', cliente('CLI-EMP', 'Cliente Empresa Uno'))
    db.prepare(`INSERT INTO empresas (id, nombre_comercial, razon_social, moneda_base)
      VALUES (2, 'OTRA EMPRESA', 'OTRA EMPRESA', 'DOP')`).run()
    seedCompany(db, 2)

    const otra: SessionContext = { ...ctx, empresaId: 2 }
    expect(busqueda.global(otra, { texto: 'empresa', limite: 10 })).toEqual([])
    expect(busquedaGlobalSchema.safeParse({ texto: 'a' }).success).toBe(false)
    db.close()
  })
})
