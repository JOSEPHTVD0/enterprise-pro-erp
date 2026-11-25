import { permissionCatalog } from '../../../shared/permissions'
import { ajustesGrupos } from '../../../shared/schemas/ajustes'

/**
 * Versión 0.5.0 — Centro de control administrativo.
 *
 * Añade ajustes por empresa con auditoría y materializa en bases existentes los
 * permisos nuevos del catálogo. No reescribe migraciones anteriores.
 */

const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`

const nuevasClaves = permissionCatalog
  .filter((p) => p.key.startsWith('configuracion.ajustes.') || p.key.startsWith('inteligencia.'))
  .map((p) => p.key)

const clavesGerente = new Set(['configuracion.ajustes.consultar', 'inteligencia.consultar', 'inteligencia.exportar'])

const sembrarPermisos = nuevasClaves.map((clave) => {
  const def = permissionCatalog.find((p) => p.key === clave)!
  return `INSERT OR IGNORE INTO permisos (clave, modulo, operacion, etiqueta)
    VALUES (${sqlLiteral(clave)}, ${sqlLiteral(def.module)}, ${sqlLiteral(def.operation)}, ${sqlLiteral(def.label)});`
}).join('\n')

const otorgarAdministrador = nuevasClaves.map((clave) => `
  INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave = ${sqlLiteral(clave)}
  WHERE r.nombre = 'Administrador';
`).join('\n')

const otorgarGerente = nuevasClaves.filter((clave) => clavesGerente.has(clave)).map((clave) => `
  INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave = ${sqlLiteral(clave)}
  WHERE r.nombre = 'Gerente';
`).join('\n')

export const centroControlSql = `
CREATE TABLE IF NOT EXISTS ajustes (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  grupo TEXT NOT NULL CHECK (grupo IN (${ajustesGrupos.map(sqlLiteral).join(', ')})),
  datos_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER REFERENCES usuarios(id),
  PRIMARY KEY (empresa_id, grupo)
);

CREATE INDEX IF NOT EXISTS idx_ajustes_empresa_grupo ON ajustes(empresa_id, grupo);

${sembrarPermisos}
${otorgarAdministrador}
${otorgarGerente}
`
