import type { Db } from '../db/connection'
import { camel, type Fila } from './ventas.repo'

/** Libro de cuentas por pagar de Fase 7. La gestión de abonos completos es Fase 8. */

export function getCxpPorDocumento(db: Db, empresaId: number, docId: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM cxp_documentos WHERE empresa_id = ? AND doc_compra_id = ?
  `).get(empresaId, docId) as Fila | undefined)
}

export function crearCxp(
  db: Db, dato: {
    empresaId: number; proveedorId: number; docCompraId: number; numeroDocumento: string
    fecha: string; vencimiento: string; montoCent: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO cxp_documentos (
      empresa_id, proveedor_id, doc_compra_id, numero_documento, fecha, vencimiento,
      monto_cent, saldo_cent
    ) VALUES (
      @empresaId, @proveedorId, @docCompraId, @numeroDocumento, @fecha, @vencimiento,
      @montoCent, @montoCent
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function anularCxp(db: Db, empresaId: number, docId: number): void {
  db.prepare(`
    UPDATE cxp_documentos SET estado = 'ANULADO', saldo_cent = 0
    WHERE empresa_id = ? AND doc_compra_id = ?
  `).run(empresaId, docId)
}

/** Abono por devolución: reduce el saldo vivo sin inventar un pago. */
export function abonarCxp(db: Db, empresaId: number, docId: number, montoCent: number): number {
  const actual = db.prepare(`
    SELECT saldo_cent FROM cxp_documentos
    WHERE empresa_id = ? AND doc_compra_id = ? AND estado = 'PENDIENTE'
  `).get(empresaId, docId) as { saldo_cent: number } | undefined
  if (!actual) return 0
  const aplicado = Math.min(Number(actual.saldo_cent), montoCent)
  const saldo = Number(actual.saldo_cent) - aplicado
  db.prepare(`
    UPDATE cxp_documentos SET saldo_cent = ?, estado = ?
    WHERE empresa_id = ? AND doc_compra_id = ?
  `).run(saldo, saldo === 0 ? 'PAGADO' : 'PENDIENTE', empresaId, docId)
  return aplicado
}

export function movimientoCxp(
  db: Db, dato: {
    empresaId: number; proveedorId: number; cxpDocumentoId: number | null
    docCompraId: number; tipo: 'CARGO' | 'ABONO' | 'ANULACION'; montoCent: number
    referencia: string; usuarioId: number
  }
): void {
  db.prepare(`
    INSERT INTO cxp_movimientos (
      empresa_id, proveedor_id, cxp_documento_id, doc_compra_id, tipo,
      monto_cent, referencia, usuario_id
    ) VALUES (
      @empresaId, @proveedorId, @cxpDocumentoId, @docCompraId, @tipo,
      @montoCent, @referencia, @usuarioId
    )
  `).run({ ...dato, cxpDocumentoId: dato.cxpDocumentoId ?? null, referencia: dato.referencia ?? '' })
}

export function ajustarBalanceProveedor(db: Db, empresaId: number, proveedorId: number, deltaCent: number): void {
  db.prepare(`
    UPDATE proveedores SET balance_cent = balance_cent + ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(deltaCent, proveedorId, empresaId)
}
