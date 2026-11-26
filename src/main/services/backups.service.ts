import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { defaultSettings, settingsSchema, type Settings } from '@shared/settings'
import type { Ajustes } from '@shared/schemas/ajustes'
import type { Db } from '../db/connection'
import { createAjustesService } from './ajustes.service'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { errors } from '@shared/errors'
import { CONFIRMACION_RESTAURACION } from '@shared/schemas/respaldos'
import { backupConfigSchema } from '@shared/schemas/config'
import type {
  RespaldosCrearInput, RespaldosIntegridadInput, RespaldosRestaurarInput
} from '@shared/schemas/respaldos'
import { writeAudit, type AuditContext } from '../repositories/auditoria.repo'
import { getParametros, setParametro } from '../repositories/configuracion.repo'

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
  /** Preferencias de estación; por defecto se lee `settings.json` de userData. */
  leerSettings?: () => Settings
  /** Procesos de la estación con la BD abierta; se inyecta desde el proceso principal. */
  instanciasActivas?: () => number
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

/** Preferencias de estación leídas desde disco, sin depender de `app` de Electron. */
export function leerPreferenciasEstacion(userDataPath: string): Settings {
  try {
    const ruta = join(userDataPath, 'settings.json')
    if (!existsSync(ruta)) return { ...defaultSettings }
    const parseado = settingsSchema.safeParse(JSON.parse(readFileSync(ruta, 'utf8')))
    return parseado.success ? parseado.data : { ...defaultSettings }
  } catch {
    return { ...defaultSettings }
  }
}

/** Entradas permitidas en el artefacto: nunca se aceptan nombres con rutas. */
export interface EntradaBackups {
  nombre: 'enterprise.db' | 'settings.json'
  contenido: Buffer
}

function octalTar(valor: number, longitud: number): string {
  return `${valor.toString(8).padStart(longitud - 1, '0').slice(-(longitud - 1))}\0`
}

function cabeceraTar(entrada: EntradaBackups): Buffer {
  const cabecera = Buffer.alloc(512)
  cabecera.write(entrada.nombre, 0, 100, 'utf8')
  cabecera.write(octalTar(0o644, 8), 100, 8, 'ascii')
  cabecera.write(octalTar(0, 8), 108, 8, 'ascii')
  cabecera.write(octalTar(0, 8), 116, 8, 'ascii')
  cabecera.write(octalTar(entrada.contenido.length, 12), 124, 12, 'ascii')
  cabecera.write(octalTar(Math.floor(Date.now() / 1000), 12), 136, 12, 'ascii')
  cabecera.fill(0x20, 148, 156)
  cabecera.write('0', 156, 1, 'ascii')
  cabecera.write('ustar\0', 257, 6, 'ascii')
  cabecera.write('00', 263, 2, 'ascii')
  const suma = cabecera.reduce((total, byte) => total + byte, 0)
  cabecera.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return cabecera
}

/** Tar USTAR mínimo: permite un único artefacto con la BD y, opcionalmente, settings.json. */
export function empaquetarBackups(entradas: EntradaBackups[], comprimir: boolean): Buffer {
  const bloques: Buffer[] = []
  for (const entrada of entradas) {
    bloques.push(cabeceraTar(entrada), entrada.contenido)
    const relleno = (512 - (entrada.contenido.length % 512)) % 512
    if (relleno) bloques.push(Buffer.alloc(relleno))
  }
  bloques.push(Buffer.alloc(1024))
  const tar = Buffer.concat(bloques)
  return comprimir ? gzipSync(tar) : tar
}

export function desempaquetarBackups(archivo: Buffer, comprimido: boolean): EntradaBackups[] {
  const tar = comprimido ? gunzipSync(archivo) : archivo
  const entradas: EntradaBackups[] = []
  let desplazamiento = 0
  while (desplazamiento + 512 <= tar.length) {
    const cabecera = tar.subarray(desplazamiento, desplazamiento + 512)
    if (cabecera.every((byte) => byte === 0)) break
    const nombre = cabecera.subarray(0, 100).toString('utf8').replace(/\0.*$/, '') as EntradaBackups['nombre']
    if (nombre !== 'enterprise.db' && nombre !== 'settings.json') {
      throw errors.validation('El respaldo contiene un archivo no permitido.')
    }
    const tamanoTexto = cabecera.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim()
    const tamano = parseInt(tamanoTexto, 8)
    if (!Number.isFinite(tamano) || tamano < 0 || desplazamiento + 512 + tamano > tar.length) {
      throw errors.validation('El respaldo está incompleto o corrupto.')
    }
    entradas.push({ nombre, contenido: tar.subarray(desplazamiento + 512, desplazamiento + 512 + tamano) })
    desplazamiento += 512 + Math.ceil(tamano / 512) * 512
  }
  if (!entradas.some((entrada) => entrada.nombre === 'enterprise.db')) {
    throw errors.validation('El respaldo no contiene la base de datos.')
  }
  return entradas
}

function esArtefactoComprimido(ruta: string): boolean {
  return ruta.endsWith('.tar.gz')
}

function esArtefactoBackups(ruta: string): boolean {
  return ruta.endsWith('.tar') || ruta.endsWith('.tar.gz')
}

export function nombreArtefactoBackups(tipo: TipoCopia, compresion: boolean): string {
  return `enterprise_${sello()}_${tipo}.tar${compresion ? '.gz' : ''}`
}

/** Extrae la BD (y las preferencias, si vienen) a rutas controladas por el proceso principal. */
export function extraerArtefactoBackups(
  ruta: string, destinoDb: string, destinoPreferencias?: string
): void {
  if (!esArtefactoBackups(ruta)) {
    copyFileSync(ruta, destinoDb)
    return
  }
  const entradas = desempaquetarBackups(readFileSync(ruta), esArtefactoComprimido(ruta))
  const db = entradas.find((entrada) => entrada.nombre === 'enterprise.db')
  if (!db) throw errors.validation('El respaldo no contiene la base de datos.')
  writeFileSync(destinoDb, db.contenido)
  const preferencias = entradas.find((entrada) => entrada.nombre === 'settings.json')
  if (preferencias && destinoPreferencias) writeFileSync(destinoPreferencias, preferencias.contenido)
}

/**
 * Un respaldo copia toda la base, no una empresa: su configuración tiene un
 * único propietario. Así la misma carpeta, frecuencia y retención se aplican
 * siempre, sin importar la empresa activa en la estación que la modifique.
 */
export function empresaConfigBackups(db: Db): number {
  const fila = db.prepare('SELECT id FROM empresas ORDER BY id LIMIT 1').get() as Record<string, unknown> | undefined
  return n(fila, 'id')
}

function sello(): string {
  const d = new Date()
  const dos = (valor: number): string => String(valor).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`
}

function baseBackups(userDataPath: string): string {
  return resolve(userDataPath, 'backups')
}

/** Resuelve una carpeta configurada y garantiza que no escape de `userData/backups`. */
export function resolverCarpetaBackups(userDataPath: string, configurada: string): string {
  const base = baseBackups(userDataPath)
  const texto = configurada.trim()
  if (isAbsolute(texto)) throw errors.validation('La carpeta de respaldo debe ser relativa.')
  const destino = texto ? resolve(base, texto) : base
  const relativo = relative(base, destino)
  if (relativo.startsWith('..') || isAbsolute(relativo)) {
    throw errors.validation('La carpeta de respaldo debe estar dentro de backups.')
  }
  mkdirSync(destino, { recursive: true })
  return destino
}

function validarRutaCopia(userDataPath: string, ruta: string): void {
  if (!isAbsolute(ruta)) throw errors.validation('Ruta de copia no válida.')
  const nombre = basename(ruta)
  const nombreValido = nombre.startsWith('enterprise_')
    && (nombre.endsWith('.db') || nombre.endsWith('.tar') || nombre.endsWith('.tar.gz'))
  if (!nombreValido) throw errors.validation('Ruta de copia no válida.')
  const relativo = relative(baseBackups(userDataPath), resolve(ruta))
  if (!relativo || relativo.startsWith('..') || isAbsolute(relativo) || relativo.includes(sep + '..')) {
    throw errors.validation('La copia no está en la carpeta de respaldos permitida.')
  }
}

function carpetaRespaldo(deps: BackupsDeps, empresaId = empresaConfigBackups(deps.db)): string {
  const parametros = getParametros(deps.db, empresaId)
  return resolverCarpetaBackups(deps.userDataPath, parametros.backup_carpeta ?? '')
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

/**
 * Verificación de `verificarAlCrear`: el artefacto existe, tiene bytes y su BD
 * pasa `integrity_check`. Para tar/tar.gz se extrae a un temporal; la BD nunca
 * se abre en modo escritura. El hash se devuelve para la auditoría.
 */
export function verificarArtefactoBackups(ruta: string): {
  ok: boolean; resultado: string; tamanoBytes: number; hash: string
} {
  if (!existsSync(ruta)) throw errors.notFound('La copia de seguridad')
  const contenido = readFileSync(ruta)
  if (contenido.length === 0) throw errors.validation('La copia de seguridad está vacía.')
  const hash = createHash('sha256').update(contenido).digest('hex')
  let temporal: string | null = null
  try {
    let objetivo = ruta
    if (esArtefactoBackups(ruta)) {
      const entradas = desempaquetarBackups(contenido, esArtefactoComprimido(ruta))
      const db = entradas.find((entrada) => entrada.nombre === 'enterprise.db')!
      if (db.contenido.length === 0) throw errors.validation('La copia de seguridad está vacía.')
      temporal = join(tmpdir(), `erp-verify-${Date.now()}-${Math.random().toString(16).slice(2)}.db`)
      writeFileSync(temporal, db.contenido)
      objetivo = temporal
    }
    const resultado = verificarArchivo(objetivo)
    return { ok: resultado === 'ok', resultado, tamanoBytes: contenido.length, hash }
  } finally {
    if (temporal && existsSync(temporal)) unlinkSync(temporal)
  }
}

function antiguasPorRetencion(deps: BackupsDeps, empresaId: number): { id: number; ruta: string }[] {
  if (existsSync(rutaMarcador(deps.userDataPath))) return []
  const dias = Number(getParametros(deps.db, empresaConfigBackups(deps.db)).backup_retencion_dias ?? 30)
  const filas = deps.db.prepare(`
    SELECT id, ruta FROM backups_historial
    WHERE empresa_id = ? AND fecha < datetime('now', 'localtime', ?) AND tipo <> 'PRE_RESTAURACION'
  `).all(empresaId, `-${Number.isFinite(dias) ? dias : 30} days`) as Record<string, unknown>[]
  return filas.map((fila) => ({ id: n(fila, 'id'), ruta: txt(fila, 'ruta') }))
}

async function hacerCopia(
  deps: BackupsDeps, tipo: TipoCopia, ctx: AuditContext | null,
  empresaId = ctx?.empresaId ?? empresaConfigBackups(deps.db)
): Promise<CopiaCreada> {
  const settings = (deps.leerSettings ?? (() => leerPreferenciasEstacion(deps.userDataPath)))()
  const { compresion, incluirPreferencias, verificarAlCrear } = settings.respaldos
  const carpeta = carpetaRespaldo(deps, empresaId)
  const ruta = join(carpeta, nombreArtefactoBackups(tipo, compresion))
  // La BD se copia con la API de SQLite (respeta WAL); el empaquetado se hace
  // sobre la copia, nunca sobre la base abierta.
  const temporalDb = join(carpeta, `.${basename(ruta)}-sqlite.db`)
  try {
    await deps.db.backup(temporalDb)
    const entradas: EntradaBackups[] = [{ nombre: 'enterprise.db', contenido: readFileSync(temporalDb) }]
    if (incluirPreferencias) {
      const preferencias = join(deps.userDataPath, 'settings.json')
      entradas.push({
        nombre: 'settings.json',
        contenido: existsSync(preferencias)
          ? readFileSync(preferencias)
          : Buffer.from(JSON.stringify(settings, null, 2), 'utf8')
      })
    }
    writeFileSync(ruta, empaquetarBackups(entradas, compresion))
  } finally {
    if (existsSync(temporalDb)) unlinkSync(temporalDb)
  }

  let integridadOk = false
  let hash: string | undefined
  if (verificarAlCrear) {
    const verificacion = verificarArtefactoBackups(ruta)
    if (!verificacion.ok) {
      if (existsSync(ruta)) unlinkSync(ruta)
      throw errors.validation(`La copia creada no pasó la verificación: ${verificacion.resultado}`)
    }
    integridadOk = true
    hash = verificacion.hash
  }
  const tamanoBytes = statSync(ruta).size
  const usuarioId = ctx?.userId ?? null
  const { id, antiguas } = deps.db.transaction(() => {
    const id = Number(deps.db.prepare(`
      INSERT INTO backups_historial (fecha, ruta, tamano_bytes, tipo, integridad_ok, usuario_id, empresa_id)
      VALUES (datetime('now', 'localtime'), ?, ?, ?, ?, ?, ?)
    `).run(ruta, tamanoBytes, tipo, integridadOk ? 1 : 0, usuarioId, empresaId).lastInsertRowid)
    const antiguas = antiguasPorRetencion(deps, empresaId)
    for (const fila of antiguas) {
      deps.db.prepare('DELETE FROM backups_historial WHERE id = ?').run(fila.id)
    }
    if (ctx) {
      writeAudit(deps.db, ctx, tipo === 'PRE_RESTAURACION' ? 'RESPALDO_PRE_RESTAURACION' : 'RESPALDO_CREADO',
        'respaldos', id, null, {
          ruta, tipo, tamanoBytes, integridadOk, hash,
          preferenciasIncluidas: incluirPreferencias, comprimido: compresion, verificado: verificarAlCrear
        })
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
  frecuencia: string, hora: string, ultimaFecha: string | null, ahora: Date,
  recordatorioDias = 7
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
  // `recordatorioDias` de settings.respaldos es el tope absoluto: aunque la
  // frecuencia configurada sea semanal o mensual, se fuerza la copia al
  // cumplirse el recordatorio de la estación.
  const dias = (ahora.getTime() - ultima.getTime()) / 86_400_000
  if (dias >= Math.max(1, recordatorioDias)) return true
  return clavePeriodo(ultima, frecuencia) !== clavePeriodo(ahora, frecuencia)
}

/** Igual que `debeEjecutar`, pero para el aviso cuando la frecuencia está desactivada. */
export function debeRecordar(
  frecuencia: string, ultimaFecha: string | null, ahora: Date, recordatorioDias = 7
): boolean {
  if (frecuencia !== 'DESACTIVADO' || !ultimaFecha) return false
  const ultima = new Date(ultimaFecha.replace(' ', 'T'))
  if (Number.isNaN(ultima.getTime())) return true
  return (ahora.getTime() - ultima.getTime()) / 86_400_000 >= Math.max(1, recordatorioDias)
}

/** Decisión pura del mantenimiento VACUUM; nunca se evalúa dentro de una transacción. */
export function debeVacuum(
  frecuencia: Ajustes['rendimiento']['vacuumProgramado'],
  ultimaFecha: string | null,
  ahora: Date
): boolean {
  if (frecuencia === 'DESACTIVADO') return false
  if (!ultimaFecha) return true
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
      WHERE b.empresa_id = ?
      ORDER BY b.id DESC LIMIT 300
    `).all(ctx.empresaId).map((fila) => {
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

  function configurar(ctx: SessionContext, entrada: unknown): { ok: true; carpeta: string } {
    requirePermission(ctx, 'configuracion.respaldo.crear')
    const cfg = backupConfigSchema.parse(entrada)
    const carpeta = resolverCarpetaBackups(deps.userDataPath, cfg.carpeta)
    const propietario = empresaConfigBackups(deps.db)
    deps.db.transaction(() => {
      const valores: Record<string, string> = {
        backup_carpeta: cfg.carpeta, backup_frecuencia: cfg.frecuencia,
        backup_hora: cfg.hora, backup_retencion_dias: String(cfg.retencionDias)
      }
      for (const [clave, valor] of Object.entries(valores)) setParametro(deps.db, propietario, clave, valor)
      writeAudit(deps.db, {
        empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId ?? null
      }, 'MODIFICAR', 'parametros', null, null, { ...cfg, propietario })
    })()
    return { ok: true, carpeta }
  }

  async function crear(ctx: SessionContext, input: RespaldosCrearInput): Promise<CopiaCreada> {
    requirePermission(ctx, 'configuracion.respaldo.crear')
    return hacerCopia(deps, input.tipo ?? 'MANUAL', {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId ?? null
    }, ctx.empresaId)
  }

  function integridad(ctx: SessionContext, input: RespaldosIntegridadInput): Record<string, unknown> {
    requirePermission(ctx, 'respaldos.consultar')
    const fila = input?.id
      ? deps.db.prepare(`
          SELECT ruta FROM backups_historial WHERE id = ? AND empresa_id = ?
        `).get(input.id, ctx.empresaId) as Record<string, unknown> | undefined
      : undefined
    const resultado = fila
      ? (verificarArtefactoBackups(txt(fila, 'ruta')).ok ? 'ok' : 'error')
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
    // Reemplazar la BD con otras conexiones abiertas puede perder datos. Con
    // varias instancias permitidas, se exige cerrarlas antes de restaurar.
    if ((deps.instanciasActivas?.() ?? 1) > 1) {
      throw errors.validation(
        'Cierre las demás instancias antes de restaurar un respaldo; la base de datos está abierta en más de un proceso.'
      )
    }
    const fila = deps.db.prepare(`
      SELECT * FROM backups_historial WHERE id = ? AND empresa_id = ?
    `).get(input.id, ctx.empresaId) as Record<string, unknown> | undefined
    if (!fila) throw errors.notFound('La copia de seguridad')
    const ruta = txt(fila, 'ruta')
    if (!existsSync(ruta)) throw errors.validation('El archivo de la copia ya no existe en disco.')
    validarRutaCopia(deps.userDataPath, ruta)
    if (!verificarArtefactoBackups(ruta).ok) {
      throw errors.validation('La copia seleccionada no pasa la verificación de integridad.')
    }

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

  return { configurar, historial, crear, integridad, restaurar }
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
  validarRutaCopia(userDataPath, marcador.ruta)
  const destino = rutaDb(userDataPath, dbPath)
  for (const sufijo of ['-wal', '-shm']) {
    const lateral = `${destino}${sufijo}`
    if (existsSync(lateral)) unlinkSync(lateral)
  }
  extraerArtefactoBackups(marcador.ruta, destino, join(userDataPath, 'settings.json'))
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
          INSERT INTO backups_historial (fecha, ruta, tamano_bytes, tipo, integridad_ok, usuario_id, empresa_id)
          VALUES (datetime('now', 'localtime'), ?, ?, 'PRE_RESTAURACION', ?, ?, ?)
        `).run(
          marcador.previa.ruta, marcador.previa.tamanoBytes,
          marcador.previa.integridadOk ? 1 : 0, marcador.usuarioId, marcador.empresaId
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
  const leerSettings = deps.leerSettings ?? (() => leerPreferenciasEstacion(deps.userDataPath))
  async function evaluar(): Promise<void> {
    if (ocupado) return
    ocupado = true
    try {
      const parametros = getParametros(deps.db, empresaConfigBackups(deps.db))
      const frecuencia = parametros.backup_frecuencia ?? 'DIARIO'
      const recordatorioDias = leerSettings().respaldos.recordatorioDias
      const ultima = deps.db.prepare(`
        SELECT fecha FROM backups_historial
         WHERE tipo = 'AUTO' AND empresa_id = ? ORDER BY fecha DESC LIMIT 1
      `).get(empresaConfigBackups(deps.db)) as Record<string, unknown> | undefined
      const fechaUltima = ultima ? txt(ultima, 'fecha') : null
      if (frecuencia === 'DESACTIVADO') {
        // Desactivar la copia automática no suprime el recordatorio de la estación.
        if (debeRecordar(frecuencia, fechaUltima, new Date(), recordatorioDias)) {
          console.info(`[backups] Recordatorio: ${recordatorioDias} día(s) sin copia automática.`)
        }
        return
      }
      if (!debeEjecutar(frecuencia, parametros.backup_hora ?? '02:00', fechaUltima, new Date(), recordatorioDias)) return
      await hacerCopia(deps, 'AUTO', null, empresaConfigBackups(deps.db))
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

/**
 * Programador de mantenimiento mínimo. VACUUM se ejecuta FUERA de `db.transaction`
 * y con WAL/FK activos; la fecha y la auditoría se registran en una transacción
 * separada, después de que VACUUM haya terminado.
 */
export function iniciarVacuumScheduler(
  db: Db,
  leerFrecuencia?: () => Ajustes['rendimiento']['vacuumProgramado']
): () => void {
  let ocupado = false
  const leer = leerFrecuencia
    ?? (() => createAjustesService(db).leerGrupo(empresaConfigBackups(db), 'rendimiento').vacuumProgramado)
  function evaluar(): void {
    if (ocupado) return
    ocupado = true
    try {
      const frecuencia = leer()
      if (frecuencia === 'DESACTIVADO') return
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      const empresaId = empresaConfigBackups(db)
      const parametros = getParametros(db, empresaId)
      const ultima = parametros.mantenimiento_ultimo_vacuum ?? null
      if (!debeVacuum(frecuencia, ultima, new Date())) return
      db.exec('VACUUM')
      db.transaction(() => {
        setParametro(db, empresaId, 'mantenimiento_ultimo_vacuum', new Date().toISOString())
        writeAudit(db, { empresaId, userId: null as unknown as number, sesionId: null }, 'MANTENIMIENTO', 'rendimiento', null,
          { vacuumProgramado: ultima }, { vacuumProgramado: frecuencia, ejecutadoEn: new Date().toISOString() })
      })()
    } catch (error) {
      console.error('[mantenimiento] No se pudo ejecutar VACUUM programado:', error)
    } finally {
      ocupado = false
    }
  }
  const temporizador = setInterval(evaluar, 60 * 60_000)
  temporizador.unref?.()
  return () => clearInterval(temporizador)
}
