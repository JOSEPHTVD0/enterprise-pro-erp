/**
 * Versión 0.5.2 — Aislamiento de respaldos por empresa e índices de auditoría
 * alineados con los filtros reales. No reescribe migraciones ya aplicadas.
 */
export const seguridadRespaldosSql = `
ALTER TABLE backups_historial ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);

UPDATE backups_historial
   SET empresa_id = (SELECT id FROM empresas ORDER BY id LIMIT 1)
 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_backups_historial_empresa
  ON backups_historial(empresa_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_fecha
  ON auditoria(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_usuario
  ON auditoria(empresa_id, usuario_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_entidad
  ON auditoria(empresa_id, entidad, id DESC);
`
