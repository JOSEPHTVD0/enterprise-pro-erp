import type { Db } from '../db/connection'
import { seedCompany, seedRolesForCompany } from '../db/seed'
import { writeAudit } from '../repositories/auditoria.repo'
import * as repo from '../repositories/configuracion.repo'
import { alertasSeries, vistaPreviaSerie } from '../repositories/series.repo'
import { requirePermission, type SessionContext } from './context'
import { empresaConfigBackups } from './backups.service'
import { createAjustesService } from './ajustes.service'
import type { Ajustes } from '@shared/schemas/ajustes'
import { errors } from '@shared/errors'

/** Backend ofrece estos formatos; `ajustes.integraciones.formatos` es el filtro de la estación. */
export const formatosBackendExportacion = ['CSV', 'XLSX', 'PDF'] as const

function integracionesDe(db: Db, empresaId: number): Ajustes['integraciones'] {
  return createAjustesService(db).leerGrupo(empresaId, 'integraciones')
}

/**
 * `settings.impresion.impresora` o la impresora de la caja son específicas y
 * prevalecen. Para tickets sin configuración específica se usa
 * `ajustes.integraciones.impresoraTicket`; al final, la impresora predeterminada.
 */
export function resolverImpresoraTicket(
  db: Db,
  empresaId: number,
  opciones: {
    impresoraEspecifica?: string
    formato?: string
    integraciones?: Ajustes['integraciones']
  } = {}
): string {
  const especifica = opciones.impresoraEspecifica?.trim()
  if (especifica) return especifica
  const integraciones = opciones.integraciones ?? integracionesDe(db, empresaId)
  if ((!opciones.formato || opciones.formato.startsWith('TICKET')) && integraciones.impresoraTicket.trim()) {
    return integraciones.impresoraTicket.trim()
  }
  const fila = db.prepare(`
    SELECT nombre FROM impresoras WHERE empresa_id = ?
    ORDER BY predeterminada DESC, id ASC LIMIT 1
  `).get(empresaId) as { nombre: string } | undefined
  return fila?.nombre?.trim() ?? ''
}

/** `ajustes.fiscal.libro606/libro607` gobiernan realmente la generación de esos libros. */
export function libroHabilitado(
  db: Db, empresaId: number, libro: 'LIBRO606' | 'LIBRO607'
): boolean {
  const fiscal = createAjustesService(db).leerGrupo(empresaId, 'fiscal')
  return libro === 'LIBRO606' ? fiscal.libro606 : fiscal.libro607
}

const mappings = {
  impuestos: {
    codigo: 'codigo', descripcion: 'descripcion', tasaBp: 'tasa_bp', exento: 'exento', activo: 'activo'
  },
  monedas: {
    codigo: 'codigo', nombre: 'nombre', simbolo: 'simbolo', decimales: 'decimales', activa: 'activa'
  },
  series_documento: {
    tipoDoc: 'tipo_doc', serie: 'serie', prefijo: 'prefijo', siguiente: 'siguiente', longitud: 'longitud',
    esNcf: 'es_ncf', rangoDesde: 'rango_desde', rangoHasta: 'rango_hasta', venceEn: 'vence_en',
    alertaMin: 'alerta_min', activa: 'activa'
  },
  almacenes: {
    codigo: 'codigo', nombre: 'nombre', direccion: 'direccion', principal: 'principal', activo: 'activo'
  },
  cajas: {
    codigo: 'codigo', nombre: 'nombre', impresoraTicket: 'impresora_ticket', activa: 'activa', almacenId: 'almacen_id'
  },
  impresoras: {
    nombre: 'nombre', puerto: 'puerto', tipo: 'tipo', predeterminada: 'predeterminada'
  }
} as const

export function createConfiguracionService(db: Db) {
  function audit(ctx: SessionContext, operacion: string, entidad: string, id: number | null, antes: unknown, despues: unknown): void {
    writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, operacion, entidad, id, antes, despues)
  }

  return {
    getConfig(ctx: SessionContext) {
      requirePermission(ctx, 'configuracion.consultar')
      // Los parámetros backup_ son globales: se leen siempre del propietario
      // canonical para que todas las estaciones vean la misma configuración.
      const parametros = Object.fromEntries(
        Object.entries(repo.getParametros(db, ctx.empresaId)).filter(([clave]) => !clave.startsWith('backup_'))
      )
      const globales = Object.entries(repo.getParametros(db, empresaConfigBackups(db)))
        .filter(([clave]) => clave.startsWith('backup_'))
      const integraciones = integracionesDe(db, ctx.empresaId)
      return {
        empresas: repo.listEmpresas(db),
        empresa: repo.getEmpresa(db, ctx.empresaId),
        parametros: { ...parametros, ...Object.fromEntries(globales) },
        // Solo se ofrecen formatos que el backend sabe producir y que la estación habilitó.
        formatosExportacion: formatosBackendExportacion.filter((formato) => integraciones.formatos.includes(formato)),
        impresoraTicketEfectiva: resolverImpresoraTicket(db, ctx.empresaId, { integraciones }),
        impuestos: repo.listCatalog(db, 'impuestos', ctx.empresaId),
        monedas: repo.listCatalog(db, 'monedas', ctx.empresaId),
        tasas: db.prepare('SELECT * FROM tasas_cambio WHERE empresa_id = ? ORDER BY fecha DESC').all(ctx.empresaId),
        series: repo.listCatalog(db, 'series_documento', ctx.empresaId),
        almacenes: repo.listCatalog(db, 'almacenes', ctx.empresaId),
        cajas: repo.listCatalog(db, 'cajas', ctx.empresaId),
        impresoras: repo.listCatalog(db, 'impresoras', ctx.empresaId),
        formatos: db.prepare('SELECT * FROM formatos_impresion WHERE empresa_id = ?').all(ctx.empresaId)
      }
    },

    saveEmpresa(ctx: SessionContext, input: Record<string, unknown>) {
      const id = input.id as number | undefined
      requirePermission(ctx, id ? 'configuracion.empresa.modificar' : 'configuracion.empresa.crear')
      if (input.rnc) {
        const dup = db.prepare('SELECT id FROM empresas WHERE rnc = ? AND id <> ?').get(input.rnc, id ?? -1)
        if (dup) throw errors.conflict('Ya existe otra empresa con ese RNC.')
      }
      const configurada = Boolean(input.nombreComercial && input.razonSocial && input.rnc && input.direccion) ? 1 : 0
      const savedId = db.transaction(() => {
        const eid = repo.upsertEmpresa(db, { ...input, configurada })
        if (!id) {
          seedCompany(db, eid)
          seedRolesForCompany(db, eid)
        }
        audit(ctx, id ? 'MODIFICAR' : 'CREAR', 'empresas', eid, id ? repo.getEmpresa(db, eid) : null, input)
        return eid
      })()
      return { id: savedId }
    },

    setParametro(ctx: SessionContext, clave: string, valor: unknown) {
      requirePermission(ctx, 'configuracion.parametros.modificar')
      // Los parámetros de respaldo solo se alteran con el permiso específico, incluso
      // si se llama al canal genérico config.parametro.set en lugar de config.backup.config.
      if (clave.startsWith('backup_')) requirePermission(ctx, 'configuracion.respaldo.crear')
      const textual = typeof valor === 'string' ? valor : JSON.stringify(valor)
      const empresa = clave.startsWith('backup_') ? empresaConfigBackups(db) : ctx.empresaId
      db.transaction(() => {
        const antes = repo.getParametros(db, empresa)[clave]
        repo.setParametro(db, empresa, clave, textual)
        audit(ctx, 'MODIFICAR', 'parametros', null, { clave, valor: antes }, { clave, valor: textual })
      })()
      return { ok: true }
    },

    saveCatalog(ctx: SessionContext, tabla: string, input: Record<string, unknown>) {
      const permiso = tabla === 'series_documento' ? 'configuracion.series.modificar' : 'configuracion.empresa.modificar'
      requirePermission(ctx, permiso)
      if (!(tabla in mappings)) throw errors.validation('Catálogo desconocido.')
      const id = input.id as number | undefined
      const antes = id ? db.prepare(`SELECT * FROM ${tabla} WHERE id = ? AND empresa_id = ?`).get(id, ctx.empresaId) as Record<string, unknown> | null : null
      if (tabla === 'series_documento' && id && antes) {
        const texto = (v: unknown): string => String(v ?? '')
        if (Number(antes.siguiente) > 1) {
          if (input.prefijo !== undefined && texto(input.prefijo) !== texto(antes.prefijo)) {
            throw errors.conflict('No se puede cambiar el prefijo de una serie con movimientos; eso rompería la correlación de los documentos emitidos.')
          }
          if (input.serie !== undefined && texto(input.serie) !== texto(antes.serie)) {
            throw errors.conflict('No se puede cambiar la subserie de una serie con movimientos.')
          }
          if (input.longitud !== undefined && Number(input.longitud) !== Number(antes.longitud)) {
            throw errors.conflict('No se puede cambiar la longitud de una serie con movimientos.')
          }
        }
        if (input.siguiente !== undefined && Number(input.siguiente) !== Number(antes.siguiente)) {
          throw errors.conflict('El correlativo es automático y no se edita manualmente; usar una serie nueva para reiniciar la numeración.')
        }
      }
      const savedId = db.transaction(() => {
        const result = repo.upsertCatalog(db, tabla, ctx.empresaId, input, mappings[tabla as keyof typeof mappings])
        audit(ctx, id ? 'MODIFICAR' : 'CREAR', tabla, result, antes, input)
        return result
      })()
      return { id: savedId }
    },

    deleteCatalog(ctx: SessionContext, tabla: string, id: number) {
      requirePermission(ctx, 'configuracion.empresa.modificar')
      if (!(tabla in mappings)) throw errors.validation('Catálogo desconocido.')
      const antes = db.prepare(`SELECT * FROM ${tabla} WHERE id = ? AND empresa_id = ?`).get(id, ctx.empresaId)
      if (!antes) throw errors.notFound('Registro')
      db.transaction(() => {
        repo.deleteCatalog(db, tabla, ctx.empresaId, id)
        audit(ctx, 'ELIMINAR', tabla, id, antes, null)
      })()
      return { ok: true }
    },

    saveTasaCambio(ctx: SessionContext, input: { monedaCodigo: string; tasa: number; fecha: string }) {
      requirePermission(ctx, 'configuracion.monedas.modificar')
      const moneda = db.prepare('SELECT 1 FROM monedas WHERE empresa_id = ? AND codigo = ?').get(ctx.empresaId, input.monedaCodigo)
      if (!moneda) throw errors.notFound('Moneda')
      db.transaction(() => {
        db.prepare(`
          INSERT INTO tasas_cambio (empresa_id, moneda_codigo, tasa, fecha, usuario_id)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(empresa_id, moneda_codigo, fecha)
          DO UPDATE SET tasa = excluded.tasa, usuario_id = excluded.usuario_id
        `).run(ctx.empresaId, input.monedaCodigo, input.tasa, input.fecha, ctx.userId)
        audit(ctx, 'MODIFICAR', 'tasas_cambio', null, null, input)
      })()
      return { ok: true }
    },

    saveFormato(ctx: SessionContext, input: { tipoDoc: string; formato: string; copias: number }) {
      requirePermission(ctx, 'configuracion.empresa.modificar')
      db.transaction(() => {
        const antes = repo.getFormato(db, ctx.empresaId, input.tipoDoc)
        db.prepare(`
          INSERT INTO formatos_impresion (empresa_id, tipo_doc, formato, copias)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(empresa_id, tipo_doc) DO UPDATE SET formato = excluded.formato, copias = excluded.copias
        `).run(ctx.empresaId, input.tipoDoc, input.formato, input.copias)
        audit(ctx, 'MODIFICAR', 'formatos_impresion', null, antes, input)
      })()
      return { ok: true }
    },

    /** Solo lectura: nunca consume un correlativo. La reserva real la hace el documento. */
    vistaPreviaNumero(ctx: SessionContext, tipoDoc: string) {
      requirePermission(ctx, 'configuracion.series.consultar')
      return vistaPreviaSerie(db, ctx.empresaId, tipoDoc)
    },

    /** Compatibilidad: el antiguo canal "reservar" ya no genera saltos. */
    reservarNumero(ctx: SessionContext, tipoDoc: string) {
      requirePermission(ctx, 'configuracion.series.consultar')
      return vistaPreviaSerie(db, ctx.empresaId, tipoDoc)
    },

    estadoSeries(ctx: SessionContext) {
      requirePermission(ctx, 'configuracion.series.consultar')
      return alertasSeries(db, ctx.empresaId)
    }
  }
}
