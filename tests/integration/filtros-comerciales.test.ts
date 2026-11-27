import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { listarDocumentos } from '../../src/main/repositories/ventas.repo'
import {
  listarAnticipos, listarCxc, listarRecibosCxc
} from '../../src/main/repositories/finanzas.repo'

function setup() {
  const db = testDb()
  const cliente = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-FILTRO', 'Cliente Filtro')
  `).run().lastInsertRowid)
  const otro = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-OTRO', 'Otro Cliente')
  `).run().lastInsertRowid)
  const producto = Number(db.prepare(`
    INSERT INTO productos (empresa_id, codigo, descripcion, tipo) VALUES (1, 'PRO-FILTRO', 'Producto Filtro', 'FISICO')
  `).run().lastInsertRowid)
  const otroProducto = Number(db.prepare(`
    INSERT INTO productos (empresa_id, codigo, descripcion, tipo) VALUES (1, 'PRO-OTRO', 'Otro Producto', 'FISICO')
  `).run().lastInsertRowid)

  const doc = (numero: string, clienteId: number, totalCent: number, estado: string, productoId: number, fecha: string) => {
    const id = Number(db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, estado, total_cent)
      VALUES (1, 'FACTURA_CONTADO', ?, ?, 'Cliente Filtro', ?, ?, ?)
    `).run(numero, clienteId, fecha, estado, totalCent).lastInsertRowid)
    db.prepare(`
      INSERT INTO documento_venta_lineas
        (empresa_id, doc_id, producto_id, descripcion, cantidad, precio_cent, subtotal_cent, total_cent)
      VALUES (1, ?, ?, 'Línea', 1, ?, ?, ?)
    `).run(id, productoId, totalCent, totalCent, totalCent)
    return id
  }

  const docUno = doc('FAC-FILTRO-0001', cliente, 10000, 'ACTIVO', producto, '2026-03-10')
  const docDos = doc('FAC-FILTRO-0002', otro, 50000, 'CONTABILIZADO', otroProducto, '2026-03-11')
  db.prepare(`
    INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FAC-FILTRO-0001', '2026-03-10', '2026-04-09', 10000, 4000, 'PENDIENTE')
  `).run(cliente, docUno)
  db.prepare(`
    INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FAC-FILTRO-0002', '2026-03-11', '2026-04-10', 50000, 50000, 'PENDIENTE')
  `).run(otro, docDos)
  db.prepare(`
    INSERT INTO cxc_recibos (empresa_id, numero, cliente_id, cliente_nombre, fecha, monto_cent, metodo, estado)
    VALUES (1, 'RIN-FILTRO-0001', ?, 'Cliente Filtro', '2026-03-12', 6000, 'EFECTIVO', 'CONTABILIZADO')
  `).run(cliente)
  db.prepare(`
    INSERT INTO anticipos (empresa_id, tipo, entidad_id, fecha, monto_cent, saldo_cent, estado, referencia)
    VALUES (1, 'CLIENTE', ?, '2026-03-13', 9000, 9000, 'ACTIVO', 'ANT-FILTRO-0001')
  `).run(cliente)
  return { db, cliente, otro, producto, otroProducto }
}

describe('filtros avanzados sobre datos reales', () => {
  it('ventas filtra por número, cliente, estado, fechas, monto y producto', () => {
    const { db, cliente, producto } = setup()
    const base = { limite: 1000 }

    expect(listarDocumentos(db, 1, { ...base, numero: '0001' }).map((f) => f.numero))
      .toEqual(['FAC-FILTRO-0001'])
    expect(listarDocumentos(db, 1, { ...base, clienteId: cliente })).toHaveLength(1)
    expect(listarDocumentos(db, 1, { ...base, estado: 'CONTABILIZADO' })).toHaveLength(1)
    expect(listarDocumentos(db, 1, { ...base, fechaDesde: '2026-03-11' })).toHaveLength(1)
    expect(listarDocumentos(db, 1, { ...base, fechaHasta: '2026-03-10' })).toHaveLength(1)
    expect(listarDocumentos(db, 1, { ...base, montoMinCent: 20000, montoMaxCent: 60000 })).toHaveLength(1)
    expect(listarDocumentos(db, 1, { ...base, productoId: producto }).map((f) => f.numero))
      .toEqual(['FAC-FILTRO-0001'])
    expect(listarDocumentos(db, 1, { ...base })).toHaveLength(2)
    db.close()
  })

  it('CxC, recibos y anticipos aplican los mismos criterios sobre columnas reales', () => {
    const { db, cliente, producto } = setup()
    const base = { limite: 1000 }

    expect(listarCxc(db, 1, { ...base, numero: '0002' })).toHaveLength(1)
    expect(listarCxc(db, 1, { ...base, entidadId: cliente })).toHaveLength(1)
    expect(listarCxc(db, 1, { ...base, estado: 'PENDIENTE' })).toHaveLength(2)
    expect(listarCxc(db, 1, { ...base, montoMinCent: 3000, montoMaxCent: 5000 })).toHaveLength(1)
    expect(listarCxc(db, 1, { ...base, productoId: producto })).toHaveLength(1)

    expect(listarRecibosCxc(db, 1, { ...base, numero: 'RIN-FILTRO' })).toHaveLength(1)
    expect(listarRecibosCxc(db, 1, { ...base, entidadId: cliente })).toHaveLength(1)
    expect(listarRecibosCxc(db, 1, { ...base, estado: 'ANULADO' })).toHaveLength(0)

    expect(listarAnticipos(db, 1, 'CLIENTE', { ...base, numero: 'ANT-FILTRO' })).toHaveLength(1)
    expect(listarAnticipos(db, 1, 'CLIENTE', { ...base, entidadId: cliente })).toHaveLength(1)
    expect(listarAnticipos(db, 1, 'CLIENTE', { ...base, montoMinCent: 10000 })).toHaveLength(0)
    db.close()
  })

  it('los documentos emitidos siguen siendo inmutables: no hay estado BORRADOR en la BD', () => {
    const { db } = setup()
    const estados = db.prepare('PRAGMA table_info(documentos_venta)').all() as { name: string; sql?: string }[]
    expect(estados.some((c) => c.name === 'estado')).toBe(true)
    expect(() => db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, estado)
      VALUES (1, 'FACTURA_CONTADO', 'FAC-BORRADOR', 1, 'Cliente', 'BORRADOR')
    `).run()).toThrow()
    db.close()
  })
})
