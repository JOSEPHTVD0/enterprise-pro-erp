import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { DomainError, errors } from '@shared/errors'
import { writeAudit } from '../repositories/auditoria.repo'
import * as aux from '../repositories/auxiliares.repo'
import * as ventasRepo from '../repositories/ventas.repo'
import type {
  PosVentaInput, SuspenderVentaInput, AbrirCajaInput, CerrarCajaInput
} from '@shared/schemas/ventas'

type VentasService = ReturnType<typeof import('./ventas.service').createVentasService>

/** Fase 6 — Punto de Venta: exige caja abierta y liga cada cobro a esa sesión. */
export function createPosService(db: Db, ventas: VentasService) {
  function audit(ctx: SessionContext, operacion: string, entidad: string, id: number, antes: unknown, despues: unknown): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  function sesionDelUsuario(ctx: SessionContext, sesionId?: number) {
    if (sesionId) {
      const sesion = aux.getSesion(db, ctx.empresaId, sesionId)
      if (!sesion) throw errors.notFound('Sesión de caja')
      if (sesion.estado !== 'ABIERTA') throw new DomainError('CAJA_CERRADA', 'Debe abrir la caja antes de realizar operaciones de POS.')
      return sesion
    }
    const sesion = aux.getSesionAbierta(db, ctx.empresaId, null, ctx.userId)
    if (!sesion) throw new DomainError('CAJA_CERRADA', 'Debe abrir la caja antes de realizar operaciones de POS.')
    return sesion
  }

  return {
    sesion(ctx: SessionContext) {
      requirePermission(ctx, 'pos.consultar')
      const sesion = aux.getSesionAbierta(db, ctx.empresaId, null, ctx.userId)
      return {
        sesion,
        caja: sesion ? aux.getCaja(db, ctx.empresaId, Number(sesion.cajaId)) : undefined,
        movimientos: sesion ? aux.listarMovimientosCaja(db, ctx.empresaId, Number(sesion.id)) : [],
        // La lista de movimientos está limitada a 300 filas; el teórico debe
        // calcularse con todas las filas para que el cierre no preload un monto
        // distinto al que valida el backend.
        teoricoCent: sesion ? aux.saldoTeorico(db, ctx.empresaId, sesion) : 0
      }
    },

    abrirCaja(ctx: SessionContext, input: AbrirCajaInput) {
      requirePermission(ctx, 'pos.abrir_caja')
      const montoCent = input.montoCent ?? 0
      const observaciones = input.observaciones ?? ''
      const cajaId = input.cajaId ?? Number(aux.getCajaPrincipal(db, ctx.empresaId)?.id ?? 0)
      if (!cajaId || !aux.getCaja(db, ctx.empresaId, cajaId)) throw errors.notFound('Caja')
      const abierta = aux.getSesionAbierta(db, ctx.empresaId, cajaId, null)
      if (abierta) throw errors.conflict('La caja ya tiene una sesión abierta.')
      return db.transaction(() => {
        const id = aux.abrirSesion(db, ctx.empresaId, cajaId, ctx.userId, montoCent, observaciones)
        if (montoCent > 0) {
          aux.movimientoCaja(db, {
            empresaId: ctx.empresaId, cajaSesionId: id, cajaId,
            tipo: 'INGRESO', metodo: 'EFECTIVO', montoCent,
            docTipo: 'APERTURA', docId: id, descripcion: 'Apertura de caja', usuarioId: ctx.userId
          })
        }
        audit(ctx, 'CREAR', 'caja_sesiones', id, null, { cajaId, montoCent })
        return { id }
      })()
    },

    cerrarCaja(ctx: SessionContext, input: CerrarCajaInput) {
      requirePermission(ctx, 'pos.cerrar_caja')
      const sesion = aux.getSesion(db, ctx.empresaId, input.sesionId)
      if (!sesion) throw errors.notFound('Sesión de caja')
      if (sesion.estado !== 'ABIERTA') throw errors.conflict('La sesión de caja ya está cerrada.')
      const teorico = aux.saldoTeorico(db, ctx.empresaId, sesion)
      return db.transaction(() => {
        aux.cerrarSesion(db, ctx.empresaId, input.sesionId, input.montoCent, input.montoCent - teorico, input.observaciones ?? '')
        audit(ctx, 'MODIFICAR', 'caja_sesiones', input.sesionId,
          { estado: 'ABIERTA' }, { estado: 'CERRADA', montoCent: input.montoCent, teoricoCent: teorico })
        return { id: input.sesionId, teoricoCent: teorico, diferenciaCent: input.montoCent - teorico }
      })()
    },

    vender(ctx: SessionContext, input: PosVentaInput) {
      requirePermission(ctx, 'pos.crear')
      const sesion = sesionDelUsuario(ctx, input.cajaSesionId)
      return db.transaction(() => {
        const resultado = ventas.crearDocumento(ctx, {
          tipo: 'POS', clienteId: input.clienteId, almacenId: input.almacenId,
          vendedorId: input.vendedorId, fecha: input.fecha, comentarios: input.comentarios ?? '',
          motivo: '', lineas: input.lineas
        }, { modulo: 'pos' })
        if (input.suspensionId) {
          db.prepare('DELETE FROM ventas_suspendidas WHERE id = ? AND empresa_id = ? AND usuario_id = ?')
            .run(input.suspensionId, ctx.empresaId, ctx.userId)
        }
        audit(ctx, 'CREAR', 'pos_ventas', resultado.id, null, { numero: resultado.numero, sesionId: sesion.id })
        return { ...resultado, cajaSesionId: Number(sesion.id) }
      })()
    },

    suspender(ctx: SessionContext, input: SuspenderVentaInput) {
      requirePermission(ctx, 'pos.crear')
      const sesion = aux.getSesionAbierta(db, ctx.empresaId, null, ctx.userId)
      if (!sesion) throw new DomainError('CAJA_CERRADA', 'Debe abrir la caja antes de realizar operaciones de POS.')
      const id = ventasRepo.suspender(
        db, ctx.empresaId, ctx.userId, Number(sesion.cajaId),
        input.nombre, JSON.stringify(input.carrito)
      )
      audit(ctx, 'CREAR', 'ventas_suspendidas', id, null, { nombre: input.nombre })
      return { id }
    },

    suspendidas(ctx: SessionContext) {
      requirePermission(ctx, 'pos.consultar')
      return ventasRepo.listarSuspendidas(db, ctx.empresaId, ctx.userId)
    },

    recuperar(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'pos.consultar')
      const payload = ventasRepo.recuperar(db, ctx.empresaId, id)
      if (!payload) throw errors.notFound('Venta suspendida')
      return { carrito: JSON.parse(payload) }
    }
  }
}
