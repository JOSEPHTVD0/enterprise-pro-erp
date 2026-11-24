/** Todas las sentencias DDL de la Fase 3. Las fases siguientes añaden migraciones 002, 003… */
export const initSql = `
CREATE TABLE IF NOT EXISTS _migraciones (
  version INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_comercial TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  rnc TEXT NOT NULL DEFAULT '',
  cedula TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  telefonos TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  logo_path TEXT,
  moneda_base TEXT NOT NULL DEFAULT 'DOP',
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  configurada INTEGER NOT NULL DEFAULT 0 CHECK (configurada IN (0,1)),
  creada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parametros (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  PRIMARY KEY (empresa_id, clave)
);

CREATE TABLE IF NOT EXISTS monedas (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  simbolo TEXT NOT NULL,
  decimales INTEGER NOT NULL DEFAULT 2,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  PRIMARY KEY (empresa_id, codigo),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS tasas_cambio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  moneda_codigo TEXT NOT NULL,
  tasa REAL NOT NULL CHECK (tasa > 0),
  fecha TEXT NOT NULL,
  usuario_id INTEGER,
  creada_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, moneda_codigo, fecha),
  FOREIGN KEY (empresa_id, moneda_codigo) REFERENCES monedas(empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS impuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tasa_bp INTEGER NOT NULL CHECK (tasa_bp BETWEEN 0 AND 10000),
  exento INTEGER NOT NULL DEFAULT 0 CHECK (exento IN (0,1)),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS series_documento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo_doc TEXT NOT NULL,
  serie TEXT NOT NULL DEFAULT '',
  prefijo TEXT NOT NULL DEFAULT '',
  siguiente INTEGER NOT NULL DEFAULT 1 CHECK (siguiente > 0),
  longitud INTEGER NOT NULL DEFAULT 8,
  es_ncf INTEGER NOT NULL DEFAULT 0 CHECK (es_ncf IN (0,1)),
  rango_desde TEXT NOT NULL DEFAULT '',
  rango_hasta TEXT NOT NULL DEFAULT '',
  vence_en TEXT NOT NULL DEFAULT '',
  alerta_min INTEGER NOT NULL DEFAULT 10,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  UNIQUE (empresa_id, tipo_doc, serie)
);

CREATE TABLE IF NOT EXISTS almacenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  direccion TEXT NOT NULL DEFAULT '',
  principal INTEGER NOT NULL DEFAULT 0 CHECK (principal IN (0,1)),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS cajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  impresora_ticket TEXT NOT NULL DEFAULT '',
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS impresoras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  puerto TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'CARTA',
  predeterminada INTEGER NOT NULL DEFAULT 0 CHECK (predeterminada IN (0,1))
);

CREATE TABLE IF NOT EXISTS formatos_impresion (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo_doc TEXT NOT NULL,
  formato TEXT NOT NULL,
  copias INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (empresa_id, tipo_doc)
);

CREATE TABLE IF NOT EXISTS departamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  departamento_id INTEGER REFERENCES departamentos(id),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  bloqueado INTEGER NOT NULL DEFAULT 0 CHECK (bloqueado IN (0,1)),
  debe_cambiar_clave INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar_clave IN (0,1)),
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS permisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  modulo TEXT NOT NULL,
  operacion TEXT NOT NULL,
  etiqueta TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE IF NOT EXISTS usuario_roles (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  PRIMARY KEY (usuario_id, rol_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS usuario_permisos_override (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permiso_id INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  concedido INTEGER NOT NULL CHECK (concedido IN (0,1)),
  PRIMARY KEY (usuario_id, permiso_id)
);

CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  inicio TEXT NOT NULL DEFAULT (datetime('now')),
  ultima_actividad TEXT NOT NULL DEFAULT (datetime('now')),
  fin TEXT,
  equipo TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  empresa_id INTEGER REFERENCES empresas(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  sesion_id INTEGER REFERENCES sesiones(id),
  operacion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  valores_antes TEXT,
  valores_despues TEXT
);

CREATE TABLE IF NOT EXISTS backups_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  ruta TEXT NOT NULL,
  tamano_bytes INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL,
  integridad_ok INTEGER NOT NULL DEFAULT 0 CHECK (integridad_ok IN (0,1)),
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id, fin);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_empresa ON usuario_roles(empresa_id, usuario_id);
CREATE INDEX IF NOT EXISTS idx_roles_empresa ON roles(empresa_id);
CREATE INDEX IF NOT EXISTS idx_series_empresa_tipo ON series_documento(empresa_id, tipo_doc);
CREATE INDEX IF NOT EXISTS idx_impuestos_empresa ON impuestos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tasas_empresa_moneda ON tasas_cambio(empresa_id, moneda_codigo, fecha);
`
