import type { Db } from '../db/connection'
import type { SessionContext } from '@shared/session'
import type {
  AnularFinanzasInput, AnticipoCrearInput, CxcReciboCrearInput, ExportarFinanzasInput,
  FinanzasFiltroInput, ImprimirFinanzasInput, ReferenciaFinanzasInput
} from '@shared/schemas/finanzas'
import { requirePermission } from './context'
import { createFinanzasService } from './finanzas.service'

/**
 * Fachada del área de cobros. Toda la operación sigue apoyándose en CxC, pero
 * la autoridad son permisos propios de Cobros: Ventas no puede cobrar aquí.
 */
export function createCobrosService(db: Db) {
  const finanzas = createFinanzasService(db)

  /**
   * CxC sigue siendo el almacén de los cobros, pero un rol solo necesita los
   * permisos de Cobros. Se trasladan las claves equivalentes al contexto interno
   * de finanzas; nunca se inventan permisos `custom.*` ni se relaja la sesión.
   */
  function contextoCobros(ctx: SessionContext): SessionContext {
    const permisos = new Set(ctx.permisos)
    const equivalencias: Record<string, string> = {
      'cobros.consultar': 'cxc.consultar',
      'cobros.crear': 'cxc.crear',
      'cobros.anular': 'cxc.anular'
    }
    for (const [origen, destino] of Object.entries(equivalencias)) {
      if (permisos.has(origen)) permisos.add(destino)
    }
    return { ...ctx, permisos: [...permisos] }
  }

  return {
    documentos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      requirePermission(ctx, 'cobros.consultar')
      return finanzas.cxcDocumentos(contextoCobros(ctx), filtro)
    },

    recibos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      requirePermission(ctx, 'cobros.consultar')
      return finanzas.cxcRecibos(contextoCobros(ctx), filtro)
    },

    anticipos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      requirePermission(ctx, 'cobros.consultar')
      return finanzas.cxcAnticipos(contextoCobros(ctx), filtro)
    },

    detalle(ctx: SessionContext, input: ReferenciaFinanzasInput) {
      requirePermission(ctx, 'cobros.consultar')
      return finanzas.cxcDetalle(contextoCobros(ctx), input)
    },

    cobrar(ctx: SessionContext, input: CxcReciboCrearInput) {
      requirePermission(ctx, 'cobros.crear')
      return finanzas.cxcReciboCrear(contextoCobros(ctx), input)
    },

    anticipar(ctx: SessionContext, input: AnticipoCrearInput) {
      requirePermission(ctx, 'cobros.crear')
      return finanzas.anticipoCrear(contextoCobros(ctx), { ...input, tipo: 'CLIENTE' })
    },

    anular(ctx: SessionContext, input: AnularFinanzasInput) {
      requirePermission(ctx, 'cobros.anular')
      return finanzas.cxcReciboAnular(contextoCobros(ctx), input)
    },

    imprimir(ctx: SessionContext, input: ImprimirFinanzasInput) {
      requirePermission(ctx, 'cobros.imprimir')
      return finanzas.cobrosImprimir(contextoCobros(ctx), input)
    },

    exportar(ctx: SessionContext, input: ExportarFinanzasInput) {
      requirePermission(ctx, 'cobros.exportar')
      return finanzas.cobrosExportar(contextoCobros(ctx), input)
    }
  }
}
