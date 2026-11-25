import { app } from 'electron'
import { statSync, statfsSync } from 'node:fs'
import os from 'node:os'
import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { alertasSeries } from '../repositories/series.repo'
import { errors } from '@shared/errors'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)

interface Comprobacion {
  nombre: string
  estado: 'ok' | 'advertencia' | 'error'
  detalle: string
}

/** Panel de salud: diagnóstico de solo lectura, sin exponer SQL al renderer. */
export function createSaludService(db: Db) {
  function resumen(ctx: SessionContext): Record<string, unknown> {
    if (!ctx.permisos.includes('salud.consultar')) throw errors.forbidden()

    const comprobaciones: Comprobacion[] = []
    const integridad = db.pragma('integrity_check') as Fila[]
    const estadoIntegridad = integridad.length === 1 && String(Object.values(integridad[0])[0]) === 'ok'
    comprobaciones.push({
      nombre: 'Integridad SQLite',
      estado: estadoIntegridad ? 'ok' : 'error',
      detalle: estadoIntegridad ? 'integrity_check: ok' : 'integrity_check detectó inconsistencias.'
    })

    const foreignKeys = db.pragma('foreign_key_check') as Fila[]
    comprobaciones.push({
      nombre: 'Integridad referencial',
      estado: foreignKeys.length === 0 ? 'ok' : 'error',
      detalle: foreignKeys.length === 0 ? 'Sin claves foráneas huérfanas.' : `${foreignKeys.length} referencia(s) huérfana(s).`
    })

    const journal = String(db.pragma('journal_mode', { simple: true }))
    comprobaciones.push({
      nombre: 'Modo de diario',
      estado: journal.toLowerCase() === 'wal' ? 'ok' : 'advertencia',
      detalle: `journal_mode = ${journal}`
    })

    let tamanoBytes = 0
    let libreBytes = 0
    try {
      tamanoBytes = statSync(db.name).size
    } catch {
      tamanoBytes = 0
    }
    try {
      const stat = statfsSync(db.name === ':memory:' ? os.tmpdir() : db.name)
      libreBytes = Number(stat.bavail) * Number(stat.bsize)
    } catch {
      libreBytes = 0
    }
    comprobaciones.push({
      nombre: 'Espacio disponible',
      estado: libreBytes === 0 ? 'advertencia' : libreBytes > 500 * 1024 * 1024 ? 'ok' : 'error',
      detalle: libreBytes === 0 ? 'No se pudo consultar el espacio libre.' : `${(libreBytes / 1024 / 1024 / 1024).toFixed(1)} GB libres`
    })

    const ultimoRespaldo = db.prepare(`
      SELECT fecha FROM backups_historial ORDER BY fecha DESC LIMIT 1
    `).get() as Fila | undefined
    const diasRespaldo = ultimoRespaldo
      ? Math.floor((Date.now() - new Date(`${String(ultimoRespaldo.fecha).replace(' ', 'T')}Z`).getTime()) / 86_400_000)
      : null
    comprobaciones.push({
      nombre: 'Respaldos',
      estado: diasRespaldo === null || diasRespaldo > 7 ? 'advertencia' : 'ok',
      detalle: diasRespaldo === null
        ? 'No hay respaldos registrados.'
        : `Último respaldo hace ${diasRespaldo} día(s).`
    })

    const sesionesActivas = n(db.prepare('SELECT COUNT(*) AS total FROM sesiones WHERE fin IS NULL').get() as Fila, 'total')
    comprobaciones.push({
      nombre: 'Sesiones',
      estado: sesionesActivas > 50 ? 'advertencia' : 'ok',
      detalle: `${sesionesActivas} sesión(es) abierta(s).`
    })

    const series = alertasSeries(db, ctx.empresaId)
    const seriesCriticas = series.filter((s) => ['AGOTADA', 'VENCIDA', 'INACTIVA'].includes(s.estado))
    const seriesAlerta = series.filter((s) => s.estado === 'ALERTA')
    comprobaciones.push({
      nombre: 'Series consecutivas',
      estado: seriesCriticas.length > 0 ? 'error' : seriesAlerta.length > 0 ? 'advertencia' : 'ok',
      detalle: seriesCriticas.length > 0
        ? `${seriesCriticas.length} serie(s) bloqueada(s): ${seriesCriticas.map((s) => s.tipoDoc).join(', ')}.`
        : seriesAlerta.length > 0
          ? `${seriesAlerta.length} serie(s) próxima(s) a agotarse: ${seriesAlerta.map((s) => s.tipoDoc).join(', ')}.`
          : `${series.length} serie(s) con correlativo continuo disponible.`
    })

    const errores = comprobaciones.filter((c) => c.estado === 'error').length
    const advertencias = comprobaciones.filter((c) => c.estado === 'advertencia').length
    const puntaje = Math.max(0, 100 - errores * 25 - advertencias * 8)

    const conteo = (sql: string, ...args: unknown[]): number =>
      n(db.prepare(sql).get(...args) as Fila, 'total')

    return {
      calificacion: errores > 0 ? 'error' : advertencias > 0 ? 'advertencia' : 'ok',
      puntaje,
      comprobaciones,
      baseDatos: {
        archivo: db.name === ':memory:' ? 'memoria' : db.name.split(/[\\/]/).pop(),
        tamanoBytes,
        paginas: Number(db.pragma('page_count', { simple: true })),
        tamanoPagina: Number(db.pragma('page_size', { simple: true })),
        versionEsquema: Number(db.pragma('schema_version', { simple: true })),
        tablas: conteo("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
        indices: conteo("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      },
      actividad: {
        usuariosActivos: conteo('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1'),
        sesionesActivas,
        auditoria24h: conteo("SELECT COUNT(*) AS total FROM auditoria WHERE fecha >= datetime('now','-1 day')"),
        respaldos: conteo('SELECT COUNT(*) AS total FROM backups_historial'),
        ultimoRespaldo: ultimoRespaldo ? String(ultimoRespaldo.fecha) : ''
      },
      proceso: {
        aplicacion: typeof app?.getVersion === 'function' ? app.getVersion() : '0.4.0',
        electron: process.versions.electron ?? 'desconocida',
        node: process.version,
        plataforma: `${os.platform()} ${os.arch()}`,
        memoriaRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        memoriaHeapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        memoriaTotalMb: Math.round(os.totalmem() / 1024 / 1024),
        memoriaLibreMb: Math.round(os.freemem() / 1024 / 1024),
        tiempoActivoSeg: Math.round(process.uptime())
      },
      calculadoEn: new Date().toISOString()
    }
  }

  return { resumen }
}
