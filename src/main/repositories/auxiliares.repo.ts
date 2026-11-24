import type { Db } from '../db/connection'
import { camel, type Fila } from './ventas.repo'

/** Libros auxiliares mínimos de Fase 6: caja y CxC. La gestión completa es Fase 8. */

export function getCajaPrincipal(db: Db, empresaId: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, codigo, nombre FROM cajas
    WHERE empresa_id = ? AND activa = 1 ORDER BY id LIMIT 1
  `).get(empresaId) as Fila | undefined)
}

export function getCaja(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, codigo, nombre FROM cajas WHERE id = ? AND empresa_id = ? AND activa = 1
  `).get(id, empresaId) as Fila | undefined)
}

export function getSesionAbierta(
  db: Db, empresaId: number, cajaId?: number | null, usuarioId?: number | null
): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM caja_sesiones
    WHERE empresa_id = ? AND estado = 'ABIERTA'
      AND (? IS NULL OR caja_id = ?)
      AND (? IS NULL OR usuario_id = ?)
    ORDER BY id DESC LIMIT 1
  `).get(
    empresaId, cajaId ?? null, cajaId ?? null,
    usuarioId ?? null, usuarioId ?? null
  ) as Fila | undefined)
}

export function getSesion(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM caja_sesiones WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function abrirSesion(
  db: Db, empresaId: number, cajaId: number, usuarioId: number,
  montoCent: number, observaciones: string
): number {
  const res = db.prepare(`
    INSERT INTO caja_sesiones (
      empresa_id, caja_id, usuario_id, monto_apertura_cent, observaciones
    ) VALUES (?, ?, ?, ?, ?)
  `).run(empresaId, cajaId, usuarioId, montoCent, observaciones)
  return Number(res.lastInsertRowid)
}

export function cerrarSesion(
  db: Db, empresaId: number, id: number, montoCent: number, diferenciaCent: number, observaciones: string
): void {
  db.prepare(`
    UPDATE caja_sesiones SET estado = 'CERRADA', fecha_cierre = datetime('now'),
      monto_cierre_cent = ?, diferencia_cent = ?, observaciones = ?
    WHERE id = ? AND empresa_id = ? AND estado = 'ABIERTA'
  `).run(montoCent, diferenciaCent, observaciones, id, empresaId)
}

export function movimientoCaja(
  db: Db, dato: {
    empresaId: number
    cajaSesionId: number | null
    cajaId: number
    tipo: 'INGRESO' | 'EGRESO'
    metodo: string
    montoCent: number
    docTipo: string
    docId: number | null
    descripcion: string
    usuarioId: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO caja_movimientos (
      empresa_id, caja_sesion_id, caja_id, tipo, metodo, monto_cent,
      doc_tipo, doc_id, descripcion, usuario_id
    ) VALUES (
      @empresaId, @cajaSesionId, @cajaId, @tipo, @metodo, @montoCent,
      @docTipo, @docId, @descripcion, @usuarioId
    )
  `).run({ ...dato, docId: dato.docId ?? null, descripcion: dato.descripcion ?? '' })
  return Number(res.lastInsertRowid)
}

export function netoSesion(db: Db, empresaId: number, sesionId: number): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto_cent ELSE -monto_cent END), 0) AS neto
    FROM caja_movimientos WHERE empresa_id = ? AND caja_sesion_id = ?
  `).get(empresaId, sesionId) as { neto: number }
  return Number(row.neto)
}

/** Efectivo teórico al cierre. La apertura ya es un movimiento INGRESO de la sesión. */
export function saldoTeorico(db: Db, empresaId: number, sesion: Fila): number {
  void sesion
  return netoSesion(db, empresaId, Number(sesion.id))
}

export function listarMovimientosCaja(db: Db, empresaId: number, sesionId?: number): Fila[] {
  const rows = (sesionId
    ? db.prepare(`
        SELECT * FROM caja_movimientos WHERE empresa_id = ? AND caja_sesion_id = ?
        ORDER BY id DESC LIMIT 300
      `).all(empresaId, sesionId)
    : db.prepare(`
        SELECT * FROM caja_movimientos WHERE empresa_id = ? ORDER BY id DESC LIMIT 300
      `).all(empresaId)) as Fila[]
  return rows.map((r) => camel(r) as Fila)
}

export function getCxcPorDocumento(db: Db, empresaId: number, docId: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM cxc_documentos WHERE empresa_id = ? AND doc_venta_id = ?
  `).get(empresaId, docId) as Fila | undefined)
}

export function crearCxc(
  db: Db, dato: {
    empresaId: number; clienteId: number; docVentaId: number; numeroDocumento: string
    fecha: string; vencimiento: string; montoCent: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO cxc_documentos (
      empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento,
      monto_cent, saldo_cent
    ) VALUES (
      @empresaId, @clienteId, @docVentaId, @numeroDocumento, @fecha, @vencimiento,
      @montoCent, @montoCent
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function anularCxc(db: Db, empresaId: number, docId: number): void {
  db.prepare(`
    UPDATE cxc_documentos SET estado = 'ANULADO', saldo_cent = 0
    WHERE empresa_id = ? AND doc_venta_id = ?
  `).run(empresaId, docId)
}

export function movimientoCxc(
  db: Db, dato: {
    empresaId: number; clienteId: number; cxcDocumentoId: number | null; docVentaId: number
    tipo: 'CARGO' | 'ABONO' | 'ANULACION'; montoCent: number
    referencia: string; usuarioId: number
  }
): void {
  db.prepare(`
    INSERT INTO cxc_movimientos (
      empresa_id, cliente_id, cxc_documento_id, doc_venta_id, tipo,
      monto_cent, referencia, usuario_id
    ) VALUES (
      @empresaId, @clienteId, @cxcDocumentoId, @docVentaId, @tipo,
      @montoCent, @referencia, @usuarioId
    )
  `).run({ ...dato, cxcDocumentoId: dato.cxcDocumentoId ?? null, referencia: dato.referencia ?? '' })
}

export function ajustarBalanceCliente(db: Db, empresaId: number, clienteId: number, deltaCent: number): void {
  db.prepare(`
    UPDATE clientes SET balance_cent = balance_cent + ? WHERE id = ? AND empresa_id = ?
  `).run(deltaCent, clienteId, empresaId)
}
