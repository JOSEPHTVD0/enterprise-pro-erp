import { ajustesGrupos } from '../../../shared/schemas/ajustes'
import { ajustesAmbitos } from '../../../shared/schemas/personalizacion'

/**
 * Versión 0.5.14 — Enlace DGI meramente visual.
 *
 * Las migraciones 009 y 011 crearon las tablas de ajustes con un CHECK que no
 * incluye el nuevo grupo. Como CREATE TABLE IF NOT EXISTS no altera tablas
 * existentes, esta migración las reconstruye conservando los datos ya guardados.
 */

const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`
const grupos = ajustesGrupos.map(sqlLiteral).join(', ')
const ambitos = ajustesAmbitos.map(sqlLiteral).join(', ')

export const dgiEnlaceVisualSql = `
CREATE TABLE ajustes_015 (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  grupo TEXT NOT NULL CHECK (grupo IN (${grupos})),
  datos_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER REFERENCES usuarios(id),
  PRIMARY KEY (empresa_id, grupo)
);

INSERT INTO ajustes_015 (empresa_id, grupo, datos_json, actualizado_en, usuario_id)
SELECT empresa_id, grupo, datos_json, actualizado_en, usuario_id FROM ajustes;

DROP TABLE ajustes;
ALTER TABLE ajustes_015 RENAME TO ajustes;
CREATE INDEX idx_ajustes_empresa_grupo ON ajustes(empresa_id, grupo);

CREATE TABLE ajustes_personalizados_015 (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ambito TEXT NOT NULL CHECK (ambito IN (${ambitos})),
  objetivo TEXT NOT NULL,
  grupo TEXT NOT NULL CHECK (grupo IN (${grupos})),
  datos_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER REFERENCES usuarios(id),
  PRIMARY KEY (empresa_id, ambito, objetivo, grupo)
);

INSERT INTO ajustes_personalizados_015
  (empresa_id, ambito, objetivo, grupo, datos_json, actualizado_en, usuario_id)
SELECT empresa_id, ambito, objetivo, grupo, datos_json, actualizado_en, usuario_id
FROM ajustes_personalizados;

DROP TABLE ajustes_personalizados;
ALTER TABLE ajustes_personalizados_015 RENAME TO ajustes_personalizados;
CREATE INDEX idx_ajustes_personalizados_empresa
  ON ajustes_personalizados(empresa_id, ambito, objetivo);
`
