import type { Db } from '../db/connection'
import type { AjustesGrupo } from '@shared/schemas/ajustes'

export interface AjusteRow {
  grupo: AjustesGrupo
  datos_json: string
  actualizado_en: string
  usuario_id: number | null
}

/** Solo se exponen grupos declarados en el esquema compartido. */
export function getAjuste(db: Db, empresaId: number, grupo: AjustesGrupo): AjusteRow | undefined {
  return db.prepare(`
    SELECT grupo, datos_json, actualizado_en, usuario_id
    FROM ajustes WHERE empresa_id = ? AND grupo = ?
  `).get(empresaId, grupo) as AjusteRow | undefined
}

export function listAjustes(db: Db, empresaId: number): AjusteRow[] {
  return db.prepare(`
    SELECT grupo, datos_json, actualizado_en, usuario_id
    FROM ajustes WHERE empresa_id = ? ORDER BY grupo
  `).all(empresaId) as AjusteRow[]
}

export function upsertAjuste(
  db: Db,
  empresaId: number,
  grupo: AjustesGrupo,
  datosJson: string,
  usuarioId: number | null
): void {
  db.prepare(`
    INSERT INTO ajustes (empresa_id, grupo, datos_json, actualizado_en, usuario_id)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(empresa_id, grupo) DO UPDATE SET
      datos_json = excluded.datos_json,
      actualizado_en = excluded.actualizado_en,
      usuario_id = excluded.usuario_id
  `).run(empresaId, grupo, datosJson, usuarioId)
}

export function deleteAjuste(db: Db, empresaId: number, grupo: AjustesGrupo): void {
  db.prepare('DELETE FROM ajustes WHERE empresa_id = ? AND grupo = ?').run(empresaId, grupo)
}
