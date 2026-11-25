import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
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
  { version: 10, nombre: 'permisos_personalizados', sql: permisosPersonalizadosSql }
]

export function configurePragmas(db: Db): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
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
  apply()
}

/** Crea una BD lista para usar (producción o pruebas en memoria). */
export function createDatabase(file: string, withSeed = true): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  configurePragmas(db)
  migrate(db)
  if (withSeed) seed(db)
  return db
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
  // Por seguridad, las sesiones de una ejecución anterior se invalidan al reiniciar.
  instance.prepare('UPDATE sesiones SET fin = datetime(\'now\') WHERE fin IS NULL').run()
  return instance
}

export function closeDatabase(): void {
  instance?.close()
  instance = null
}
