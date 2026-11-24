import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { errors } from '@shared/errors'
import { CONFIRMACION_RESTAURACION } from '@shared/schemas/respaldos'
import type {
  RespaldosCrearInput, RespaldosIntegridadInput, RespaldosRestaurarInput
} from '@shared/schemas/respaldos'
import { writeAudit, type AuditContext } from '../repositories/auditoria.repo'
import { getParametros } from '../repositories/configuracion.repo'

type TipoCopia = 'MANUAL' | 'AUTO' | 'PRE_RESTAURACION'

interface CopiaCreada {
  id: number
  ruta: string
  tipo: TipoCopia
  tamanoBytes: number
  integridadOk: boolean
}

export interface BackupsDeps {
  db: Db
  userDataPath: string
  /** Ruta real de la BD; en pruebas se puede sustituir por un archivo temporal. */
  dbPath?: string
  /** En producción reinicia Electron; en pruebas se inyecta un doble. */
  reiniciar?: () => void
}

export interface MarcadorRestauracion {
  backupId: number
  ruta: string
  usuarioId: number
  empresaId: number
  solicitadoEn: string
  /** Copia de seguridad creada antes de reemplazar la BD; se registra tras la restauración. */
  previa?: { ruta: string; tamanoBytes: number; integridadOk: boolean } | null
}

const n = (fila: Record<string, unknown> | undefined, clave: string): number => Number(fila?.[clave] ?? 0)
const txt = (fila: Record<string, unknown> | undefined, clave: string): string => String(fila?.[clave] ?? '')

function rutaDb(userDataPath: string, dbPath?: string): string {
  return dbPath ?? join(userDataPath, 'data', 'enterprise.db')
}

function rutaMarcador(userDataPath: string): string {
  return join(userDataPath, 'restore-pending.json')
}

function primeraEmpresa(db: Db): number {
  const fila = db.prepare('SELECT id FROM empresas ORDER BY id LIMIT 1').get() as Record<string, unknown> | undefined
  return n(fila, 'id')
}

function sello(): string {
  const d = new Date()
  const dos = (valor: number): string => String(valor).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`
}

function carpetaRespaldo(deps: BackupsDeps): string {
  const empresaId = primeraEmpresa(deps.db)
  const parametros = getParametros(deps.db, empresaId)
  const configurada = (parametros.backup_carpeta ?? '').trim()
  const destino = configurada
    ? (isAbsolute(configurada) ? configurada : join(deps.userDataPath, configurada))
    : join(deps.userDataPath, 'backups')
  mkdirSync(destino, { recursive: true })
  return destino
}

/** Abre la copia en modo solo lectura; nunca modifica el archivo inspeccionado. */
export function verificarArchivo(ruta: string): string {
  if (!existsSync(ruta)) throw errors.notFound('La copia de seguridad')
  const temporal = new Database(ruta, { readonly: true, fileMustExist: true })
  try {
    return String(temporal.pragma('integrity_check', { simple: true }))
  } finally {
    temporal.close()
  }
}

function antiguasPorRetencion(deps: BackupsDeps): { id: number; ruta: string }[] {
  if (existsSync(rutaMarcador(deps.userDataPath))) return []
  const dias = Number(getParametros(deps.db, primeraEmpresa(deps.db)).backup_retencion_dias ?? 30)
  const filas = deps.db.prepare(`
    SELECT id, ruta FROM backups_historial
    WHERE fecha < datetime('now', 'localtime', ?) AND tipo <> 'PRE_RESTAURACION'
  `).all(`-${Number.isFinite(dias) ? dias : 30} days`) as Record<string, unknown>[]
  return filas.map((fila) => ({ id: n(fila, 'id'), ruta: txt(fila, 'ruta') }))
}

async function hacerCopia(
  deps: BackupsDeps, tipo: TipoCopia, ctx: AuditContext | null
): Promise<CopiaCreada> {
  const ruta = join(carpetaRespaldo(deps), `enterprise_${sello()}_${tipo}.db`)
  await deps.db.backup(ruta)
  const integridadOk = verificarArchivo(ruta) === 'ok'
  const tamanoBytes = statSync(ruta).size
  const usuarioId = ctx?.userId ?? null
  const { id, antiguas } = deps.db.transaction(() => {
    const id = Number(deps.db.prepare(`
      INSERT INTO backups_historial (fecha, ruta, tamano_bytes, tipo, integridad_ok, usuario_id)
      VALUES (datetime('now', 'localtime'), ?, ?, ?, ?, ?)
    `).run(ruta, tamanoBytes, tipo, integridadOk ? 1 : 0, usuarioId).lastInsertRowid)
    const antiguas = antiguasPorRetencion(deps)
    for (const fila of antiguas) {
      deps.db.prepare('DELETE FROM backups_historial WHERE id = ?').run(fila.id)
    }
    if (ctx) {
      writeAudit(deps.db, ctx, tipo === 'PRE_RESTAURACION' ? 'RESPALDO_PRE_RESTAURACION' : 'RESPALDO_CREADO',
        'respaldos', id, null, { ruta, tipo, tamanoBytes, integridadOk })
    }
    return { id, antiguas }
  })()
  for (const fila of antiguas) {
    if (fila.ruta && existsSync(fila.ruta) && basename(fila.ruta).startsWith('enterprise_')) {
      unlinkSync(fila.ruta)
    }
  }
  return { id, ruta, tipo, tamanoBytes, integridadOk }
}

/** Clave local del período: evita dos copias automáticas dentro del mismo día/semana/mes. */
export function clavePeriodo(fecha: Date, frecuencia: string): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  if (frecuencia === 'MENSUAL') return `${anio}-${mes}`
  if (frecuencia === 'SEMANAL') {
    const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
    return `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, '0')}-${String(lunes.getDate()).padStart(2, '0')}`
  }
  return `${anio}-${mes}-${dia}`
}

/** Lógica pura del programador, verificable sin temporizadores ni electron. */
export function debeEjecutar(
  frecuencia: string, hora: string, ultimaFecha: string | null, ahora: Date
): boolean {
  if (frecuencia === 'DESACTIVADO') return false
  const [horas, minutos] = hora.split(':').map(Number)
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return false
  const objetivo = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), horas, minutos, 0, 0)
  if (ahora < objetivo) return false
  if (!ultimaFecha) return true
  // SQLite guarda la fecha de cada copia en hora local (datetime('now','localtime')).
  const ultima = new Date(ultimaFecha.replace(' ', 'T'))
  if (Number.isNaN(ultima.getTime())) return true
  return clavePeriodo(ultima, frecuencia) !== clavePeriodo(ahora, frecuencia)
}

export function createBackupsService(deps: BackupsDeps) {
  function historial(ctx: SessionContext): Record<string, unknown>[] {
    requirePermission(ctx, 'respaldos.consultar')
    return deps.db.prepare(`
      SELECT b.*, u.username FROM backups_historial b
      LEFT JOIN usuarios u ON u.id = b.usuario_id
      ORDER BY b.id DESC LIMIT 300
    `).all().map((fila) => {
      const filaTyped = fila as Record<string, unknown>
      return {
        id: n(filaTyped, 'id'),
        fecha: txt(filaTyped, 'fecha'),
        ruta: txt(filaTyped, 'ruta'),
        nombre: basename(txt(filaTyped, 'ruta')),
        tamanoBytes: n(filaTyped, 'tamano_bytes'),
        tipo: txt(filaTyped, 'tipo'),
        integridadOk: n(filaTyped, 'integridad_ok') === 1,
        usuario: txt(filaTyped, 'username') || 'Sistema',
        existe: existsSync(txt(filaTyped, 'ruta'))
      }
    })
  }

  async function crear(ctx: SessionContext, input: RespaldosCrearInput): Promise<CopiaCreada> {
    requirePermission(ctx, 'configuracion.respaldo.crear')
    return hacerCopia(deps, input.tipo ?? 'MANUAL', {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId ?? null
    })
  }

  function integridad(ctx: SessionContext, input: RespaldosIntegridadInput): Record<string, unknown> {
    requirePermission(ctx, 'respaldos.consultar')
    const resultado = input?.id
      ? verificarArchivo(txt(deps.db.prepare('SELECT ruta FROM backups_historial WHERE id = ?').get(input.id) as Record<string, unknown> | undefined, 'ruta'))
      : String(deps.db.pragma('integrity_check', { simple: true }))
    return {
      ok: resultado === 'ok',
      resultado,
      destino: input?.id ? `copia ${input.id}` : 'base de datos actual',
      verificadoEn: new Date().toISOString()
    }
  }

  async function restaurar(ctx: SessionContext, input: RespaldosRestaurarInput): Promise<Record<string, unknown>> {
    requirePermission(ctx, 'configuracion.respaldo.restaurar')
    if (input.confirmacion !== CONFIRMACION_RESTAURACION) {
      throw errors.validation('La confirmación de restauración no es correcta.')
    }
    const fila = deps.db.prepare('SELECT * FROM backups_historial WHERE id = ?').get(input.id) as Record<string, unknown> | undefined
    if (!fila) throw errors.notFound('La copia de seguridad')
    const ruta = txt(fila, 'ruta')
    if (!existsSync(ruta)) throw errors.validation('El archivo de la copia ya no existe en disco.')
    if (!basename(ruta).startsWith('enterprise_') || !basename(ruta).endsWith('.db')) {
      throw errors.validation('Ruta de copia no válida.')
    }
    if (verificarArchivo(ruta) !== 'ok') throw errors.validation('La copia seleccionada no pasa la verificación de integridad.')

    // Siempre se crea una copia de la BD actual antes de tocar cualquier archivo.
    const previa = await hacerCopia(deps, 'PRE_RESTAURACION', {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId ?? null
    })
    const marcador: MarcadorRestauracion = {
      backupId: n(fila, 'id'),
      ruta,
      usuarioId: ctx.userId,
      empresaId: ctx.empresaId,
      solicitadoEn: new Date().toISOString(),
      previa: {
        ruta: previa.ruta, tamanoBytes: previa.tamanoBytes, integridadOk: previa.integridadOk
      }
    }
    const marcadorPath = rutaMarcador(deps.userDataPath)
    const temporal = `${marcadorPath}.tmp`
    writeFileSync(temporal, JSON.stringify(marcador, null, 2), 'utf8')
    renameSync(temporal, marcadorPath)
    deps.db.transaction(() => {
      writeAudit(deps.db, {
        empresaId: ctx.empresaId,
        userId: ctx.userId,
        sesionId: ctx.sesionId ?? null
      }, 'RESTAURAR_RESPALDO', 'respaldos', marcador.backupId, null, {
        ruta, copiaPreviaId: previa.id
      })
    })()
    // Se responde al renderer antes de que el proceso se reinicie.
    setTimeout(() => deps.reiniciar?.(), 600)
    return { ok: true, reiniciando: true, copiaPreviaId: previa.id }
  }

  return { historial, crear, integridad, restaurar }
}

/**
 * Se ejecuta ANTES de abrir SQLite en el arranque. Reemplaza la BD por la copia marcada
 * y elimina WAL/SHM para que un journal antiguo no se aplique sobre el archivo restaurado.
 */
export function consumirRestauracionPendiente(userDataPath: string, dbPath?: string): MarcadorRestauracion | null {
  const marcadorPath = rutaMarcador(userDataPath)
  if (!existsSync(marcadorPath)) return null
  const marcador = JSON.parse(readFileSync(marcadorPath, 'utf8')) as MarcadorRestauracion
  if (!marcador?.ruta || !isAbsolute(marcador.ruta) || !existsSync(marcador.ruta)) {
    throw errors.validation('La copia marcada para restaurar no existe; revise el historial de respaldos.')
  }
  if (!basename(marcador.ruta).startsWith('enterprise_') || !basename(marcador.ruta).endsWith('.db')) {
    throw errors.validation('La ruta marcada no corresponde a una copia válida.')
  }
  const destino = rutaDb(userDataPath, dbPath)
  for (const sufijo of ['-wal', '-shm']) {
    const lateral = `${destino}${sufijo}`
    if (existsSync(lateral)) unlinkSync(lateral)
  }
  copyFileSync(marcador.ruta, destino)
  unlinkSync(marcadorPath)
  return marcador
}

/** La restauración vuelve a un snapshot anterior: se reconstruye aquí su rastro operativo. */
export function registrarRestauracionAuditoria(db: Db, marcador: MarcadorRestauracion): void {
  db.transaction(() => {
    const ctx = { empresaId: marcador.empresaId, userId: marcador.usuarioId, sesionId: null }
    let copiaPreviaId: number | null = null
    if (marcador.previa?.ruta && existsSync(marcador.previa.ruta)) {
      if (!db.prepare('SELECT id FROM backups_historial WHERE ruta = ?').get(marcador.previa.ruta)) {
        copiaPreviaId = Number(db.prepare(`
          INSERT INTO backups_historial (fecha, ruta, tamano_bytes, tipo, integridad_ok, usuario_id)
          VALUES (datetime('now', 'localtime'), ?, ?, 'PRE_RESTAURACION', ?, ?)
        `).run(
          marcador.previa.ruta, marcador.previa.tamanoBytes,
          marcador.previa.integridadOk ? 1 : 0, marcador.usuarioId
        ).lastInsertRowid)
      } else {
        copiaPreviaId = n(db.prepare('SELECT id FROM backups_historial WHERE ruta = ?').get(marcador.previa.ruta) as Record<string, unknown>, 'id')
      }
    }
    if (copiaPreviaId !== null) {
      writeAudit(db, ctx, 'RESPALDO_PRE_RESTAURACION', 'respaldos', copiaPreviaId, null, {
        ruta: marcador.previa?.ruta
      })
    }
    writeAudit(db, ctx, 'RESTAURAR_RESPALDO', 'respaldos', marcador.backupId, null, {
      ruta: marcador.ruta, copiaPreviaId
    })
    writeAudit(db, ctx, 'RESTAURACION_APLICADA', 'respaldos', marcador.backupId, null, {
      ruta: marcador.ruta,
      aplicadaEn: new Date().toISOString()
    })
  })()
}

/** Programador en proceso: sin dependencias ni hilos externos. Devuelve función de parada. */
export function iniciarBackupScheduler(deps: BackupsDeps): () => void {
  let ocupado = false
  async function evaluar(): Promise<void> {
    if (ocupado) return
    ocupado = true
    try {
      const parametros = getParametros(deps.db, primeraEmpresa(deps.db))
      const frecuencia = parametros.backup_frecuencia ?? 'DIARIO'
      if (frecuencia === 'DESACTIVADO') return
      const ultima = deps.db.prepare(`
        SELECT fecha FROM backups_historial WHERE tipo = 'AUTO' ORDER BY fecha DESC LIMIT 1
      `).get() as Record<string, unknown> | undefined
      if (!debeEjecutar(frecuencia, parametros.backup_hora ?? '02:00', ultima ? txt(ultima, 'fecha') : null, new Date())) return
      await hacerCopia(deps, 'AUTO', null)
    } catch (error) {
      console.error('[backups] No se pudo ejecutar la copia programada:', error)
    } finally {
      ocupado = false
    }
  }
  const temporizador = setInterval(() => void evaluar(), 15_000)
  temporizador.unref?.()
  return () => clearInterval(temporizador)
}
