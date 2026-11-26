import { describe, expect, it } from 'vitest'
import type { SessionContext } from '@shared/session'
import { roleTemplates } from '@shared/permissions'
import { testDb } from '../helpers/db'
import { createAuthService } from '../../src/main/services/auth.service'
import { createCobrosService } from '../../src/main/services/cobros.service'
import { createPosService } from '../../src/main/services/pos.service'
import { createVentasService } from '../../src/main/services/ventas.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-COBROS').context! as SessionContext
  const cobros = createCobrosService(db)
  const inventario = createInventarioService(db)
  createPosService(db, createVentasService(db, inventario)).abrirCaja(ctx, { montoCent: 0, observaciones: 'Caja para cobros' })
  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre, rnc_cedula, limite_credito_cent)
    VALUES (1, 'CLI-COBROS', 'Cliente Cobros', '123456789', 1000000)
  `).run().lastInsertRowid)
  const ventaId = Number(db.prepare(`
    INSERT INTO documentos_venta
      (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, estado,
       subtotal_cent, impuesto_cent, total_cent, costo_total_cent)
    VALUES (1, 'FACTURA_CREDITO', 'FAC-COBROS-1', ?, 'Cliente Cobros', '2026-01-10', 'ACTIVO', 10000, 0, 10000, 6000)
  `).run(clienteId).lastInsertRowid)
  const documentoId = Number(db.prepare(`
    INSERT INTO cxc_documentos
      (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FAC-COBROS-1', '2026-01-10', '2026-02-10', 10000, 10000, 'PENDIENTE')
  `).run(clienteId, ventaId).lastInsertRowid)
  return { db, ctx, cobros, clienteId, documentoId }
}

/** Perfil que solo tiene Cobros: ni CxC directo ni Ventas. */
function soloCobros(ctx: SessionContext, ...extra: string[]): SessionContext {
  return {
    ...ctx,
    permisos: ['cobros.consultar', 'cobros.crear', 'cobros.anular', 'clientes.consultar', ...extra]
  }
}

describe('área de Cobros separada de Ventas', () => {
  it('cobra y anula con permisos propios, sin permisos CxC', () => {
    const { db, ctx, cobros, clienteId, documentoId } = setup()
    const perfil = soloCobros(ctx)

    expect(() => cobros.documentos({ ...perfil, permisos: perfil.permisos.filter((p) => p !== 'cobros.consultar') })).toThrow(/permiso/i)
    expect(() => cobros.cobrar({ ...perfil, permisos: perfil.permisos.filter((p) => p !== 'cobros.crear') }, {
      clienteId, montoCent: 4000,
      aplicaciones: [{ cxcDocumentoId: documentoId, montoCent: 4000 }]
    })).toThrow(/permiso/i)

    const recibo = cobros.cobrar(perfil, {
      clienteId, montoCent: 4000, metodo: 'EFECTIVO', referencia: 'RECIBO-COBROS',
      aplicaciones: [{ cxcDocumentoId: documentoId, montoCent: 4000 }], comentarios: 'Cobro parcial'
    }) as { id: number; numero: string }
    expect(recibo.numero).toMatch(/^RIN-/)

    const saldo = db.prepare('SELECT saldo_cent FROM cxc_documentos WHERE id = ?').get(documentoId) as { saldo_cent: number }
    expect(saldo.saldo_cent).toBe(6000)
    expect(cobros.recibos(perfil).length).toBeGreaterThan(0)

    cobros.anular(perfil, { id: recibo.id, motivo: 'Prueba de separación' })
    const revertido = db.prepare('SELECT saldo_cent FROM cxc_documentos WHERE id = ?').get(documentoId) as { saldo_cent: number }
    expect(revertido.saldo_cent).toBe(10000)
    db.close()
  })

  it('las plantillas separan quién vende de quién cobra', () => {
    const ventas = roleTemplates.find((t) => t.id === 'ventas')!
    const cobros = roleTemplates.find((t) => t.id === 'cobros')!
    expect(ventas.permisos.some((p) => p.startsWith('cobros.'))).toBe(false)
    expect(ventas.permisos.some((p) => p.startsWith('ventas.'))).toBe(true)
    expect(cobros.permisos.some((p) => p.startsWith('ventas.') || p.startsWith('pos.'))).toBe(false)
    expect(cobros.permisos.some((p) => p.startsWith('cobros.'))).toBe(true)
  })

  it('un permiso custom.* nunca autoriza cobrar', () => {
    const { ctx, cobros, clienteId, documentoId } = setup()
    const perfil = { ...ctx, permisos: ['custom.cobros_totales', 'clientes.consultar'] }
    expect(() => cobros.documentos(perfil)).toThrow(/permiso/i)
    expect(() => cobros.cobrar(perfil, {
      clienteId, montoCent: 1000,
      aplicaciones: [{ cxcDocumentoId: documentoId, montoCent: 1000 }]
    })).toThrow(/permiso/i)
  })
})
