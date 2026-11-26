import type { Db } from '../db/connection'
import { requirePermission, type SessionContext } from './context'
import { writeAudit } from '../repositories/auditoria.repo'
import * as repo from '../repositories/ajustes.repo'
import { errors } from '@shared/errors'
import {
  ajustesGetSchema, ajustesGruposVisuales, ajustesPorGrupo, ajustesResetSchema,
  ajustesSaveSchema, defaultAjustes,
  type Ajustes, type AjustesGet, type AjustesGrupo
} from '@shared/schemas/ajustes'
import {
  ajustesPersonalizadoDeleteSchema, ajustesPersonalizadoSaveSchema,
  type AjustesPersonalizadoDelete, type AjustesPersonalizadoGet,
  type AjustesPersonalizadoSave
} from '@shared/schemas/personalizacion'

/** Permisos adicionales para los grupos que pueden afectar la operación o la seguridad. */
const permisosPorGrupo: Partial<Record<AjustesGrupo, string>> = {
  seguridad: 'configuracion.ajustes.seguridad.modificar',
  integraciones: 'configuracion.ajustes.integraciones.modificar',
  featureFlags: 'configuracion.ajustes.featureFlags.modificar',
  interfaz: 'configuracion.ajustes.interfaz.modificar'
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
      featureFlags: leerGrupo(ctx.empresaId, 'featureFlags'),
      interfaz: leerGrupo(ctx.empresaId, 'interfaz'),
      panel2026: leerGrupo(ctx.empresaId, 'panel2026')
    }
  }

  /**
   * Interfaz efectiva del usuario: empresa → roles → permisos. Nunca expone
   * grupos operativos (seguridad, integraciones, etc.).
   */
  function efectivos(ctx: SessionContext): Partial<Ajustes> {
    const grupos = ajustesGruposVisuales as readonly AjustesGrupo[]
    const resultado: Record<string, unknown> = {}
    for (const grupo of grupos) resultado[grupo] = { ...leerGrupo(ctx.empresaId, grupo) }

    const roles = db.prepare(`
      SELECT r.id FROM roles r
      JOIN usuario_roles ur ON ur.rol_id = r.id AND ur.empresa_id = r.empresa_id
      WHERE r.empresa_id = ? AND ur.usuario_id = ? AND r.activo = 1
      ORDER BY r.id
    `).all(ctx.empresaId, ctx.userId) as { id: number }[]

    const capas: { ambito: string; objetivo: string }[] = [
      ...roles.map((r) => ({ ambito: 'ROL', objetivo: String(r.id) })),
      ...[...ctx.permisos].sort().map((permiso) => ({ ambito: 'PERMISO', objetivo: permiso }))
    ]

    for (const capa of capas) {
      const filas = repo.listAjustesPersonalizados(db, ctx.empresaId).filter(
        (f) => f.ambito === capa.ambito && f.objetivo === capa.objetivo
      )
      for (const fila of filas) {
        if (!grupos.includes(fila.grupo)) continue
        try {
          const crudo: unknown = JSON.parse(fila.datos_json)
          if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) continue
          const parsed = ajustesPorGrupo[fila.grupo].safeParse(crudo)
          if (parsed.success) {
            // Solo se fusionan las claves escritas en la capa: los defaults de
            // Zod no deben borrar lo que definió una capa de mayor prioridad.
            const valido = parsed.data as Record<string, unknown>
            const cambios: Record<string, unknown> = {}
            for (const clave of Object.keys(crudo)) cambios[clave] = valido[clave]
            resultado[fila.grupo] = { ...(resultado[fila.grupo] as object), ...cambios }
          }
        } catch {
          // Una capa corrupta se ignora; prevalece la última capa válida.
        }
      }
    }
    return resultado as Partial<Ajustes>
  }

  function validarObjetivo(ctx: SessionContext, ambito: string, objetivo: string): void {
    if (ambito === 'ROL') {
      const rol = db.prepare(`
        SELECT 1 FROM roles WHERE id = ? AND empresa_id = ? AND activo = 1
      `).get(Number(objetivo), ctx.empresaId)
      if (!rol) throw errors.notFound('Rol')
      return
    }
    const permiso = db.prepare(`
      SELECT 1 FROM permisos WHERE clave = ? AND (empresa_id IS NULL OR empresa_id = ?)
    `).get(objetivo, ctx.empresaId)
    if (!permiso) throw errors.notFound('Permiso')
  }

  function listPersonalizados(ctx: SessionContext, entrada: unknown) {
    requirePermission(ctx, 'configuracion.ajustes.consultar')
    const filtro: AjustesPersonalizadoGet = (entrada ?? {}) as AjustesPersonalizadoGet
    const grupo = filtro.grupo
    if (grupo) requirePermission(ctx, permisosPorGrupo[grupo] ?? 'configuracion.ajustes.modificar')
    return repo.listAjustesPersonalizados(db, ctx.empresaId, grupo)
  }

  function savePersonalizado(ctx: SessionContext, entrada: unknown) {
    requirePermission(ctx, 'configuracion.ajustes.modificar')
    const input: AjustesPersonalizadoSave = ajustesPersonalizadoSaveSchema.parse(entrada)
    requirePermission(ctx, permisosPorGrupo[input.grupo] ?? 'configuracion.ajustes.modificar')
    validarObjetivo(ctx, input.ambito, input.objetivo)
    const validados = ajustesPorGrupo[input.grupo].parse(input.datos) as Record<string, unknown>
    // Se persiste solo lo que el administrador escribió: así una capa parcial
    // no sustituye silenciosamente otras claves ya personalizadas.
    const datos: Record<string, unknown> = {}
    for (const clave of Object.keys(input.datos)) datos[clave] = validados[clave]
    const antes = repo.listAjustesPersonalizados(db, ctx.empresaId, input.grupo)
      .find((f) => f.ambito === input.ambito && f.objetivo === input.objetivo)?.datos_json ?? null
    db.transaction(() => {
      repo.upsertAjustePersonalizado(
        db, ctx.empresaId, input.ambito, input.objetivo, input.grupo,
        JSON.stringify(datos), ctx.userId
      )
      writeAudit(
        db,
        { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
        'MODIFICAR', 'ajustes_personalizados',
        `${input.ambito}:${input.objetivo}:${input.grupo}`, antes, datos
      )
    })()
    return { ok: true, ...input, datos }
  }

  function deletePersonalizado(ctx: SessionContext, entrada: unknown) {
    requirePermission(ctx, 'configuracion.ajustes.restaurar')
    const input: AjustesPersonalizadoDelete = ajustesPersonalizadoDeleteSchema.parse(entrada)
    requirePermission(ctx, permisosPorGrupo[input.grupo] ?? 'configuracion.ajustes.modificar')
    validarObjetivo(ctx, input.ambito, input.objetivo)
    const antes = repo.listAjustesPersonalizados(db, ctx.empresaId, input.grupo)
      .find((f) => f.ambito === input.ambito && f.objetivo === input.objetivo)?.datos_json ?? null
    db.transaction(() => {
      repo.deleteAjustePersonalizado(db, ctx.empresaId, input.ambito, input.objetivo, input.grupo)
      writeAudit(
        db,
        { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
        'MODIFICAR', 'ajustes_personalizados',
        `${input.ambito}:${input.objetivo}:${input.grupo}`, antes, null
      )
    })()
    return { ok: true, ...input }
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

  return {
    get, save, reset, leerGrupo, efectivos,
    listPersonalizados, savePersonalizado, deletePersonalizado
  }
}
