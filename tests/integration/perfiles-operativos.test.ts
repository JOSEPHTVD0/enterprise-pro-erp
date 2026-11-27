import { describe, expect, it } from 'vitest'
import type { SessionContext } from '@shared/session'
import { testDb } from '../helpers/db'
import { createAuthService } from '../../src/main/services/auth.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import { createSeguridadService } from '../../src/main/services/seguridad.service'
import { seedUsers } from '../../src/main/db/seed'

function login(db: ReturnType<typeof testDb>, username: string, password: string): SessionContext {
  const resultado = createAuthService(db).login({ username, password }, `PC-${username.toUpperCase()}`)
  return resultado.context! as SessionContext
}

describe('usuarios operativos semilla', () => {
  it('facturador crea facturas pero no cobra ni ve el panel comercial', () => {
    const db = testDb()
    const ctx = login(db, seedUsers[0].username, seedUsers[0].password)
    expect(ctx.debeCambiarClave).toBe(true)
    expect(ctx.permisos).toContain('ventas.crear')
    expect(ctx.permisos).toContain('ventas.consultar')
    expect(ctx.permisos).toContain('clientes.consultar')
    expect(ctx.permisos).toContain('productos.consultar')
    expect(ctx.permisos).not.toContain('cobros.consultar')
    expect(ctx.permisos).not.toContain('cobros.crear')
    expect(ctx.permisos).not.toContain('reportes.consultar')
    db.close()
  })

  it('cobrador registra cobros pero no emite facturas ni ve el panel comercial', () => {
    const db = testDb()
    const ctx = login(db, seedUsers[1].username, seedUsers[1].password)
    expect(ctx.debeCambiarClave).toBe(true)
    expect(ctx.permisos).toContain('cobros.consultar')
    expect(ctx.permisos).toContain('cobros.crear')
    expect(ctx.permisos).toContain('cobros.anular')
    expect(ctx.permisos).not.toContain('ventas.consultar')
    expect(ctx.permisos).not.toContain('ventas.crear')
    expect(ctx.permisos).not.toContain('reportes.consultar')
    expect(ctx.permisos).not.toContain('cxc.consultar')
    db.close()
  })

  it('los roles operativos no se pueden eliminar desde el centro de control', () => {
    const db = testDb()
    const admin = login(db, 'admin', 'Admin1234!')
    const seguridad = createSeguridadService(db)
    for (const nombre of ['Facturador', 'Cobrador']) {
      const rol = db.prepare('SELECT id FROM roles WHERE empresa_id = 1 AND nombre = ?').get(nombre) as { id: number }
      expect(() => seguridad.deleteRole(admin, rol.id)).toThrow(/del sistema/)
    }
    db.close()
  })

  it('Cobros carga sus catálogos sin necesidad de permiso CxC', () => {
    const db = testDb()
    const admin = login(db, 'admin', 'Admin1234!')
    db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre, rnc_cedula, limite_credito_cent, activo)
      VALUES (1, 'CLI-PERFIL', 'Cliente Perfil', '123456789', 1000000, 1)
    `).run()
    const perfil = { ...admin, permisos: ['cobros.consultar'] } as SessionContext
    const catalogos = createFinanzasService(db).catalogos(perfil) as unknown as {
      clientes?: { nombre: string }[]
    }
    expect(Array.isArray(catalogos.clientes)).toBe(true)
    expect(catalogos.clientes?.some((cliente) => cliente.nombre === 'Cliente Perfil')).toBe(true)
    db.close()
  })
})
