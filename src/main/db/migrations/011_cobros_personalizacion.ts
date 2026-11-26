import { permissionCatalog } from '../../../shared/permissions'
import { ajustesGrupos } from '../../../shared/schemas/ajustes'
import { ajustesAmbitos } from '../../../shared/schemas/personalizacion'

/**
 * Versión 0.5.2 — Separación real de Ventas y Cobros, y personalización
 * por rol/permiso. No reescribe migraciones anteriores.
 */

const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`

const nuevasClaves = permissionCatalog
  .filter((p) => p.key.startsWith('cobros.') ||
    p.key === 'seguridad.rol.eliminar' ||
    p.key === 'configuracion.ajustes.interfaz.modificar')
  .map((p) => p.key)

const sembrarPermisos = nuevasClaves.map((clave) => {
  const def = permissionCatalog.find((p) => p.key === clave)!
  return `INSERT OR IGNORE INTO permisos (clave, modulo, operacion, etiqueta, descripcion, critico)
    VALUES (${sqlLiteral(clave)}, ${sqlLiteral(def.module)}, ${sqlLiteral(def.operation)},
      ${sqlLiteral(def.label)}, ${sqlLiteral(def.descripcion)}, ${def.critico ? 1 : 0});`
}).join('\n')

function otorgar(rol: string, claves: string[]): string {
  return claves.map((clave) => `
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave = ${sqlLiteral(clave)}
    WHERE r.nombre = ${sqlLiteral(rol)};
  `).join('\n')
}

const gerente = nuevasClaves.filter((clave) =>
  clave.startsWith('cobros.') || clave === 'configuracion.ajustes.interfaz.modificar')

export const cobrosPersonalizacionSql = `
CREATE TABLE IF NOT EXISTS ajustes_personalizados (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ambito TEXT NOT NULL CHECK (ambito IN (${ajustesAmbitos.map(sqlLiteral).join(', ')})),
  objetivo TEXT NOT NULL,
  grupo TEXT NOT NULL CHECK (grupo IN (${ajustesGrupos.map(sqlLiteral).join(', ')})),
  datos_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER REFERENCES usuarios(id),
  PRIMARY KEY (empresa_id, ambito, objetivo, grupo)
);

CREATE INDEX IF NOT EXISTS idx_ajustes_personalizados_empresa
  ON ajustes_personalizados(empresa_id, ambito, objetivo);

${sembrarPermisos}
${otorgar('Administrador', nuevasClaves)}
${otorgar('Gerente', gerente)}
`
