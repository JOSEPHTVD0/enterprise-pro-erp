import { permissionCatalog } from '../../../shared/permissions'

/**
 * Versión 0.5.0 — Permisos creados por el administrador.
 *
 * Los permisos del sistema siguen siendo la única autoridad para las rutas
 * existentes. Esta migración añade metadatos al catálogo y un espacio `custom.*`
 * que puede crearse, describirse, auditarse y asignarse a roles por empresa.
 */

const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`

const descripciones = permissionCatalog.map((p) => `
  UPDATE permisos
     SET descripcion = ${sqlLiteral(p.descripcion)}, critico = ${p.critico ? 1 : 0}
   WHERE clave = ${sqlLiteral(p.key)};
`).join('\n')

export const permisosPersonalizadosSql = `
ALTER TABLE permisos ADD COLUMN descripcion TEXT NOT NULL DEFAULT '';
ALTER TABLE permisos ADD COLUMN critico INTEGER NOT NULL DEFAULT 0 CHECK (critico IN (0,1));
ALTER TABLE permisos ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
ALTER TABLE permisos ADD COLUMN personalizado INTEGER NOT NULL DEFAULT 0 CHECK (personalizado IN (0,1));
ALTER TABLE permisos ADD COLUMN creado_en TEXT NOT NULL DEFAULT '';

UPDATE permisos SET creado_en = datetime('now') WHERE creado_en = '';

CREATE INDEX IF NOT EXISTS idx_permisos_empresa_personalizado
  ON permisos(empresa_id, personalizado);

${descripciones}
`
