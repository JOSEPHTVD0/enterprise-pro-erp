import type { Db } from '../db/connection'

/** Lista blanca: el nombre de tabla nunca puede venir del renderer. */
const CATALOG_TABLES = ['impuestos', 'monedas', 'series_documento', 'almacenes', 'cajas', 'impresoras'] as const
type CatalogTable = (typeof CATALOG_TABLES)[number]

function safeTable(table: string): CatalogTable {
  if (!CATALOG_TABLES.includes(table as CatalogTable)) throw new Error(`Tabla de catálogo no permitida: ${table}`)
  return table as CatalogTable
}

export function listEmpresas(db: Db): Record<string, unknown>[] {
  return db.prepare('SELECT * FROM empresas ORDER BY id').all() as Record<string, unknown>[]
}

export function getEmpresa(db: Db, id: number): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM empresas WHERE id = ?').get(id) as Record<string, unknown> | undefined
}

export function upsertEmpresa(db: Db, data: Record<string, unknown>): number {
  const columns = [
    'nombre_comercial', 'razon_social', 'rnc', 'cedula', 'direccion', 'telefonos',
    'email', 'logo_path', 'moneda_base', 'activa', 'configurada'
  ]
  const mapping: Record<string, string> = {
    nombreComercial: 'nombre_comercial', razonSocial: 'razon_social', rnc: 'rnc',
    cedula: 'cedula', direccion: 'direccion', telefonos: 'telefonos', email: 'email',
    logoPath: 'logo_path', monedaBase: 'moneda_base', activa: 'activa', configurada: 'configurada'
  }
  const values: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = mapping[k]
    if (col && columns.includes(col)) values[col] = typeof v === 'boolean' ? (v ? 1 : 0) : v
  }
  if (data.id) {
    const cols = Object.keys(values).map((c) => `${c} = @${c}`).join(', ')
    db.prepare(`UPDATE empresas SET ${cols} WHERE id = @id`).run({ ...values, id: data.id })
    return Number(data.id)
  }
  const cols = Object.keys(values)
  const res = db.prepare(`
    INSERT INTO empresas (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})
  `).run(values)
  return Number(res.lastInsertRowid)
}

export function getParametros(db: Db, empresaId: number): Record<string, string> {
  const rows = db.prepare('SELECT clave, valor FROM parametros WHERE empresa_id = ?').all(empresaId) as { clave: string; valor: string }[]
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]))
}

export function setParametro(db: Db, empresaId: number, clave: string, valor: string): void {
  db.prepare(`
    INSERT INTO parametros (empresa_id, clave, valor) VALUES (?, ?, ?)
    ON CONFLICT(empresa_id, clave) DO UPDATE SET valor = excluded.valor
  `).run(empresaId, clave, valor)
}

export function listImpuestos(db: Db, empresaId: number): Record<string, unknown>[] {
  return db.prepare('SELECT * FROM impuestos WHERE empresa_id = ? ORDER BY codigo').all(empresaId) as Record<string, unknown>[]
}

export function upsertCatalog(db: Db, table: string, empresaId: number, data: Record<string, unknown>, mapping: Record<string, string>): number {
  const tableName = safeTable(table)
  const values: Record<string, unknown> = { empresa_id: empresaId }
  for (const [k, v] of Object.entries(data)) {
    const col = mapping[k]
    if (col && k !== 'id' && v !== undefined) values[col] = typeof v === 'boolean' ? (v ? 1 : 0) : v
  }
  const cols = Object.keys(values)
  if (data.id) {
    const sets = cols.map((c) => `${c} = @${c}`).join(', ')
    db.prepare(`UPDATE ${tableName} SET ${sets} WHERE id = @id AND empresa_id = @empresa_id`).run({ ...values, id: data.id })
    return Number(data.id)
  }
  return Number(db.prepare(`
    INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})
  `).run(values).lastInsertRowid)
}

export function deleteCatalog(db: Db, table: string, empresaId: number, id: number): void {
  db.prepare(`DELETE FROM ${safeTable(table)} WHERE id = ? AND empresa_id = ?`).run(id, empresaId)
}

export function listCatalog(db: Db, table: string, empresaId: number): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${safeTable(table)} WHERE empresa_id = ? ORDER BY rowid`).all(empresaId) as Record<string, unknown>[]
}

export function getSerie(db: Db, empresaId: number, tipoDoc: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM series_documento WHERE empresa_id = ? AND tipo_doc = ?').get(empresaId, tipoDoc) as Record<string, unknown> | undefined
}

/** Numeración atómica: una sola sentencia evita duplicados bajo concurrencia. */
export function nextSerieNumber(db: Db, empresaId: number, tipoDoc: string): string {
  const update = db.prepare(`
    UPDATE series_documento SET siguiente = siguiente + 1
    WHERE empresa_id = ? AND tipo_doc = ? AND activa = 1
    RETURNING prefijo, serie, siguiente, longitud
  `)
  const row = update.get(empresaId, tipoDoc) as { prefijo: string; serie: string; siguiente: number; longitud: number } | undefined
  if (!row) throw new Error(`No existe serie activa para ${tipoDoc}`)
  // RETURNING devuelve el valor ya incrementado: el número reservado es el anterior.
  const numero = String(row.siguiente - 1).padStart(row.longitud, '0')
  return `${row.prefijo}${row.serie}${numero}`
}

export function getFormato(db: Db, empresaId: number, tipoDoc: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM formatos_impresion WHERE empresa_id = ? AND tipo_doc = ?').get(empresaId, tipoDoc) as Record<string, unknown> | undefined
}
