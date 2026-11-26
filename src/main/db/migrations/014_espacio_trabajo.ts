import { permissionCatalog, seedRoles } from '../../../shared/permissions'

/**
 * Versión 0.5.11 — Espacio de trabajo.
 *
 * Añade persistencia real para plantillas de personalización e historial central
 * de comprobantes, además de los permisos del nuevo dominio. No modifica las
 * migraciones 001–013: las bases existentes reciben los permisos por inserción
 * idempotente y las bases nuevas los toman del catálogo compartido.
 */
const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`

const permisosEspacio = permissionCatalog.filter((permiso) => permiso.key.startsWith('espacio.'))

const insertarPermisos = permisosEspacio.map((permiso) => `
INSERT OR IGNORE INTO permisos (clave, modulo, operacion, etiqueta, descripcion, critico, creado_en)
VALUES (${sqlLiteral(permiso.key)}, ${sqlLiteral(permiso.module)}, ${sqlLiteral(permiso.operation)},
        ${sqlLiteral(permiso.label)}, ${sqlLiteral(permiso.descripcion)}, ${permiso.critico ? 1 : 0}, datetime('now'));
`).join('\n')

const asignarPermisos = ['Administrador', 'Gerente'].flatMap((nombre) => {
  const filtro = seedRoles.find((rol) => rol.name === nombre)?.permissionFilter ?? (() => true)
  return permisosEspacio.filter((permiso) => filtro(permiso.key)).map((permiso) => `
INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave = ${sqlLiteral(permiso.key)}
 WHERE r.nombre = ${sqlLiteral(nombre)};
`)
}).join('\n')

export const espacioTrabajoSql = `
CREATE TABLE IF NOT EXISTS espacio_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL,
  ajustes_json TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS espacio_emisiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra')),
  documento_id INTEGER NOT NULL,
  numero TEXT NOT NULL DEFAULT '',
  formato TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  sesion_id INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_espacio_presets_empresa
  ON espacio_presets(empresa_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_espacio_emisiones_empresa
  ON espacio_emisiones(empresa_id, origen, id DESC);
CREATE INDEX IF NOT EXISTS idx_espacio_emisiones_doc
  ON espacio_emisiones(empresa_id, origen, documento_id, id DESC);

${insertarPermisos}

-- Los permisos se otorgan por empresa para que las bases ya migradas tengan el
-- mismo acceso que una instalación nueva.
${asignarPermisos}
`
