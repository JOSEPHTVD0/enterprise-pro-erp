/** Fase 4 — Maestros. Dinero en centavos enteros; borrado lógico mediante `activo`. */
export const maestrosSql = `
CREATE TABLE IF NOT EXISTS vendedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  comision_pct_bp INTEGER NOT NULL DEFAULT 0 CHECK (comision_pct_bp BETWEEN 0 AND 10000),
  regla TEXT NOT NULL DEFAULT 'VENTA' CHECK (regla IN ('VENTA','COBRO','PRODUCTO')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS listas_precio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  observaciones TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  padre_id INTEGER REFERENCES categorias(id),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS marcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS unidades_medida (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  decimales INTEGER NOT NULL DEFAULT 2 CHECK (decimales BETWEEN 0 AND 4),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'EMPRESA' CHECK (tipo IN ('EMPRESA','PERSONA_FISICA')),
  rnc_cedula TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  municipio TEXT NOT NULL DEFAULT '',
  limite_credito_cent INTEGER NOT NULL DEFAULT 0 CHECK (limite_credito_cent >= 0),
  balance_cent INTEGER NOT NULL DEFAULT 0,
  condicion_pago_dias INTEGER NOT NULL DEFAULT 0 CHECK (condicion_pago_dias BETWEEN 0 AND 365),
  lista_precio_id INTEGER REFERENCES listas_precio(id),
  vendedor_id INTEGER REFERENCES vendedores(id),
  observaciones TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre_comercial TEXT NOT NULL,
  razon_social TEXT NOT NULL DEFAULT '',
  rnc TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  contacto TEXT NOT NULL DEFAULT '',
  condicion_pago_dias INTEGER NOT NULL DEFAULT 0 CHECK (condicion_pago_dias BETWEEN 0 AND 365),
  balance_cent INTEGER NOT NULL DEFAULT 0,
  cuenta_bancaria TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL,
  descripcion_extra TEXT NOT NULL DEFAULT '',
  categoria_id INTEGER REFERENCES categorias(id),
  marca_id INTEGER REFERENCES marcas(id),
  modelo TEXT NOT NULL DEFAULT '',
  unidad_id INTEGER REFERENCES unidades_medida(id),
  tipo TEXT NOT NULL DEFAULT 'FISICO' CHECK (tipo IN ('FISICO','SERVICIO','COMPUESTO','SERIALIZADO','LOTE')),
  costo_promedio_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_promedio_cent >= 0),
  costo_ultima_compra_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_ultima_compra_cent >= 0),
  precio1_cent INTEGER NOT NULL DEFAULT 0 CHECK (precio1_cent >= 0),
  precio2_cent INTEGER NOT NULL DEFAULT 0 CHECK (precio2_cent >= 0),
  precio3_cent INTEGER NOT NULL DEFAULT 0 CHECK (precio3_cent >= 0),
  precio_mayorista_cent INTEGER NOT NULL DEFAULT 0 CHECK (precio_mayorista_cent >= 0),
  precio_minimo_cent INTEGER NOT NULL DEFAULT 0 CHECK (precio_minimo_cent >= 0),
  impuesto_id INTEGER REFERENCES impuestos(id),
  existencia_min REAL NOT NULL DEFAULT 0 CHECK (existencia_min >= 0),
  existencia_max REAL NOT NULL DEFAULT 0 CHECK (existencia_max >= 0),
  ubicacion TEXT NOT NULL DEFAULT '',
  imagen_path TEXT NOT NULL DEFAULT '',
  maneja_serie INTEGER NOT NULL DEFAULT 0 CHECK (maneja_serie IN (0,1)),
  maneja_lote INTEGER NOT NULL DEFAULT 0 CHECK (maneja_lote IN (0,1)),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_barcode ON productos(empresa_id, barcode) WHERE barcode <> '';

CREATE TABLE IF NOT EXISTS producto_componentes (
  producto_padre_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  componente_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (producto_padre_id, componente_id)
);

CREATE TABLE IF NOT EXISTS lista_precio_items (
  lista_id INTEGER NOT NULL REFERENCES listas_precio(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio_cent INTEGER NOT NULL CHECK (precio_cent >= 0),
  PRIMARY KEY (lista_id, producto_id)
);

CREATE TABLE IF NOT EXISTS historial_precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_anterior_cent INTEGER NOT NULL,
  valor_nuevo_cent INTEGER NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_clientes_busqueda ON clientes(empresa_id, nombre);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_proveedores_busqueda ON proveedores(empresa_id, nombre_comercial);
CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_productos_busqueda ON productos(empresa_id, descripcion);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_marcas_empresa ON marcas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_unidades_empresa ON unidades_medida(empresa_id);
CREATE INDEX IF NOT EXISTS idx_listas_empresa ON listas_precio(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_empresa ON vendedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_historial_precios_producto ON historial_precios(producto_id, fecha);
`
