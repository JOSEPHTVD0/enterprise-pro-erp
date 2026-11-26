import Database from 'better-sqlite3'
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { initSql } from './migrations/001_init'
import { maestrosSql } from './migrations/002_maestros'
import { inventarioSql } from './migrations/003_inventario'
import { ventasSql } from './migrations/004_ventas'
import { comprasSql } from './migrations/005_compras'
import { finanzasSql } from './migrations/006_finanzas'
import { modulos2026Sql } from './migrations/007_modulos_2026'
import { contabilidadSql } from './migrations/008_contabilidad'
import { centroControlSql } from './migrations/009_centro_control'
import { permisosPersonalizadosSql } from './migrations/010_permisos_personalizados'
import { cobrosPersonalizacionSql } from './migrations/011_cobros_personalizacion'
import { seguridadRespaldosSql } from './migrations/012_seguridad_respaldos'
import { ingresoMercanciaSql } from './migrations/013_ingreso_mercancia'
import { espacioTrabajoSql } from './migrations/014_espacio_trabajo'
import { seed } from './seed'

export type Db = Database.Database

const migrations: { version: number; nombre: string; sql: string }[] = [
  { version: 1, nombre: 'init', sql: initSql },
  { version: 2, nombre: 'maestros', sql: maestrosSql },
  { version: 3, nombre: 'inventario', sql: inventarioSql },
  { version: 4, nombre: 'ventas', sql: ventasSql },
  { version: 5, nombre: 'compras', sql: comprasSql },
  { version: 6, nombre: 'finanzas', sql: finanzasSql },
  { version: 7, nombre: 'modulos_2026', sql: modulos2026Sql },
  { version: 8, nombre: 'contabilidad', sql: contabilidadSql },
  { version: 9, nombre: 'centro_control', sql: centroControlSql },
  { version: 10, nombre: 'permisos_personalizados', sql: permisosPersonalizadosSql },
  { version: 11, nombre: 'cobros_personalizacion', sql: cobrosPersonalizacionSql },
  { version: 12, nombre: 'seguridad_respaldos', sql: seguridadRespaldosSql },
  { version: 13, nombre: 'ingreso_mercancia', sql: ingresoMercanciaSql },
  { version: 14, nombre: 'espacio_trabajo', sql: espacioTrabajoSql }
]

export function configurePragmas(db: Db): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
}

/**
 * Serializa la primera apertura/creación de la BD entre procesos. Sin este
 * bloqueo, dos instancias pueden aplicar la misma migración a la vez y SQLite
 * devuelve `database is locked` al intentar promover su transacción de lectura.
 */
function conBloqueoInicio<T>(file: string, accion: () => T): T {
  if (file === ':memory:') return accion()
  const bloqueo = `${file}.init.lock`
  const limite = Date.now() + 30_000

  while (true) {
    let descriptor: number
    try {
      descriptor = openSync(bloqueo, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        const fecha = Number(readFileSync(bloqueo, 'utf-8'))
        if (!Number.isFinite(fecha) || Date.now() - fecha > 30_000) rmSync(bloqueo, { force: true })
      } catch { /* otra instancia ya lo liberó */ }
      if (Date.now() > limite) throw new Error('No se pudo inicializar la base de datos: otra instancia la está abriendo.')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
      continue
    }

    try {
      writeFileSync(descriptor, String(Date.now()), 'utf-8')
      return accion()
    } finally {
      closeSync(descriptor)
      rmSync(bloqueo, { force: true })
    }
  }
}

/** Aplica migraciones pendientes dentro de una transacción (todo o nada). */
export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      version INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const apply = db.transaction(() => {
    for (const m of migrations) {
      const exists = db.prepare('SELECT 1 FROM _migraciones WHERE version = ?').get(m.version)
      if (!exists) {
        db.exec(m.sql)
        db.prepare('INSERT INTO _migraciones (version, nombre) VALUES (?, ?)').run(m.version, m.nombre)
      }
    }
  })
  // IMMEDIATE reserva la escritura desde el inicio: evita el interbloqueo de dos
  // procesos que leen `_migraciones` y luego intentan escribir a la vez.
  apply.immediate()
}

/** Crea una BD lista para usar (producción o pruebas en memoria). */
export function createDatabase(file: string, withSeed = true): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  return conBloqueoInicio(file, () => {
    const db = new Database(file)
    try {
      configurePragmas(db)
      migrate(db)
      if (withSeed) seed(db)
      return db
    } catch (error) {
      db.close()
      throw error
    }
  })
}

let instance: Db | null = null

export function getDb(): Db {
  if (!instance) throw new Error('La base de datos no ha sido inicializada')
  return instance
}

export function initializeDatabase(): Db {
  if (instance) return instance
  const file = join(app.getPath('userData'), 'data', 'enterprise.db')
  instance = createDatabase(file)
  // No se cierran aquí las sesiones activas: con varias instancias, cada arranque
  // desloguearía a las demás. `buildContext` ya aplica inactividad de 30 min y
  // vigencia absoluta de 12 h en cada llamada, y cierra la sesión al expirar.
  return instance
}

export function closeDatabase(): void {
  instance?.close()
  instance = null
}
