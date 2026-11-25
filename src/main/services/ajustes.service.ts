import type { Db } from '../db/connection'
import { requirePermission, type SessionContext } from './context'
import { writeAudit } from '../repositories/auditoria.repo'
import * as repo from '../repositories/ajustes.repo'
import {
  ajustesGetSchema, ajustesPorGrupo, ajustesResetSchema, ajustesSaveSchema,
  defaultAjustes, type Ajustes, type AjustesGrupo, type AjustesGet
} from '@shared/schemas/ajustes'

/** Permisos adicionales para los grupos que pueden afectar la operación o la seguridad. */
const permisosPorGrupo: Partial<Record<AjustesGrupo, string>> = {
  seguridad: 'configuracion.ajustes.seguridad.modificar',
  integraciones: 'configuracion.ajustes.integraciones.modificar',
  featureFlags: 'configuracion.ajustes.featureFlags.modificar'
}

export function createAjustesService(db: Db) {
  /** Lectura interna sin permiso: la usan otros servicios del proceso principal. */
  function leerGrupo<K extends AjustesGrupo>(empresaId: number, grupo: K): Ajustes[K] {
    const fila = repo.getAjuste(db, empresaId, grupo)
    if (!fila) return defaultAjustes[grupo]
    try {
      const parsed = ajustesPorGrupo[grupo].safeParse(JSON.parse(fila.datos_json))
      if (parsed.success) return parsed.data as Ajustes[K]
    } catch {
      // Un JSON corrupto no debe romper el arranque: se usa el default validado.
    }
    return defaultAjustes[grupo]
  }

  function get(ctx: SessionContext, entrada: unknown): AjustesGet {
    requirePermission(ctx, 'configuracion.ajustes.consultar')
    const filtro = ajustesGetSchema.parse(entrada ?? {})
    if (filtro.grupo) return { [filtro.grupo]: leerGrupo(ctx.empresaId, filtro.grupo) } as AjustesGet
    return {
      alertas: leerGrupo(ctx.empresaId, 'alertas'),
      flujos: leerGrupo(ctx.empresaId, 'flujos'),
      widgets: leerGrupo(ctx.empresaId, 'widgets'),
      rendimiento: leerGrupo(ctx.empresaId, 'rendimiento'),
      integraciones: leerGrupo(ctx.empresaId, 'integraciones'),
      tema: leerGrupo(ctx.empresaId, 'tema'),
      fiscal: leerGrupo(ctx.empresaId, 'fiscal'),
      notificaciones: leerGrupo(ctx.empresaId, 'notificaciones'),
      seguridad: leerGrupo(ctx.empresaId, 'seguridad'),
      featureFlags: leerGrupo(ctx.empresaId, 'featureFlags')
    }
  }

  function save(ctx: SessionContext, entrada: unknown): { ok: true; grupo: AjustesGrupo; datos: unknown } {
    requirePermission(ctx, 'configuracion.ajustes.modificar')
    const input = ajustesSaveSchema.parse(entrada)
    const permisoExtra = permisosPorGrupo[input.grupo]
    if (permisoExtra) requirePermission(ctx, permisoExtra)

    const antes = leerGrupo(ctx.empresaId, input.grupo)
    const datos = input.datos
    db.transaction(() => {
      repo.upsertAjuste(db, ctx.empresaId, input.grupo, JSON.stringify(datos), ctx.userId)
      writeAudit(
        db,
        { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
        'MODIFICAR', 'ajustes', input.grupo, antes, datos
      )
    })()
    return { ok: true, grupo: input.grupo, datos }
  }

  function reset(ctx: SessionContext, entrada: unknown): { ok: true; grupo: AjustesGrupo; datos: unknown } {
    requirePermission(ctx, 'configuracion.ajustes.restaurar')
    const input = ajustesResetSchema.parse(entrada)
    const permisoExtra = permisosPorGrupo[input.grupo]
    if (permisoExtra) requirePermission(ctx, permisoExtra)

    const antes = leerGrupo(ctx.empresaId, input.grupo)
    const datos = defaultAjustes[input.grupo]
    db.transaction(() => {
      repo.deleteAjuste(db, ctx.empresaId, input.grupo)
      writeAudit(
        db,
        { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
        'MODIFICAR', 'ajustes', input.grupo, antes, datos
      )
    })()
    return { ok: true, grupo: input.grupo, datos }
  }

  return { get, save, reset, leerGrupo }
}
