/**
 * Fase 5 — Inventario.
 *
 * El kardex es inmutable: se protege con triggers y el repositorio nunca
 * emite UPDATE/DELETE sobre `movimientos_inventario`. Las correcciones se
 * hacen con nuevos movimientos de signo contrario, nunca borrando el historial.
 * El valor de las existencias se guarda en centavos enteros.
 */
export const inventarioSql = `
CREATE TABLE IF NOT EXISTS existencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  almacen_id INTEGER NOT NULL REFERENCES almacenes(id),
  cantidad REAL NOT NULL DEFAULT 0,
  valor_cent INTEGER NOT NULL DEFAULT 0 CHECK (valor_cent >= 0),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, producto_id, almacen_id)
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'COMPRA','VENTA','DEV_VENTA','DEV_COMPRA',
    'TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA',
    'AJUSTE_ENTRADA','AJUSTE_SALIDA','PERDIDA','DANIO','CONTEO','PRODUCCION'
  )),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  almacen_id INTEGER NOT NULL REFERENCES almacenes(id),
  cantidad REAL NOT NULL CHECK (cantidad <> 0),
  costo_unit_cent INTEGER NOT NULL CHECK (costo_unit_cent >= 0),
  costo_total_cent INTEGER NOT NULL,
  saldo_cantidad REAL NOT NULL,
  saldo_costo_cent INTEGER NOT NULL CHECK (saldo_costo_cent >= 0),
  doc_tipo TEXT NOT NULL DEFAULT 'MOVIMIENTO',
  doc_id INTEGER,
  doc_linea_id INTEGER,
  motivo TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE TRIGGER IF NOT EXISTS trg_kardex_no_update
BEFORE UPDATE ON movimientos_inventario
BEGIN
  SELECT RAISE(ABORT, 'El kardex de inventario es inmutable.');
END;

CREATE TRIGGER IF NOT EXISTS trg_kardex_no_delete
BEFORE DELETE ON movimientos_inventario
BEGIN
  SELECT RAISE(ABORT, 'El kardex de inventario es inmutable.');
END;

CREATE TABLE IF NOT EXISTS transferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  almacen_origen_id INTEGER NOT NULL REFERENCES almacenes(id),
  almacen_destino_id INTEGER NOT NULL REFERENCES almacenes(id),
  motivo TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','ANULADO')),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero),
  CHECK (almacen_origen_id <> almacen_destino_id)
);

CREATE TABLE IF NOT EXISTS transferencia_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transferencia_id INTEGER NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  costo_unit_cent INTEGER NOT NULL CHECK (costo_unit_cent >= 0),
  salida_movimiento_id INTEGER,
  entrada_movimiento_id INTEGER
);

CREATE TABLE IF NOT EXISTS ajustes_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  tipo TEXT NOT NULL CHECK (tipo IN ('AJUSTE','CONTEO','PERDIDA','DANIO')),
  almacen_id INTEGER NOT NULL REFERENCES almacenes(id),
  motivo TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','ANULADO')),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS ajuste_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ajuste_id INTEGER NOT NULL REFERENCES ajustes_inventario(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad <> 0),
  cantidad_nueva REAL,
  costo_unit_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_unit_cent >= 0),
  movimiento_id INTEGER
);

CREATE TABLE IF NOT EXISTS series_producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  serie TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE' CHECK (estado IN ('DISPONIBLE','VENDIDO','DEVUELTO')),
  doc_tipo TEXT NOT NULL DEFAULT '',
  doc_id INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, producto_id, serie)
);

CREATE TABLE IF NOT EXISTS lotes_producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  lote TEXT NOT NULL,
  vencimiento TEXT NOT NULL DEFAULT '',
  cantidad REAL NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, producto_id, almacen_id, lote)
);

CREATE TABLE IF NOT EXISTS costos_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  costo_anterior_cent INTEGER NOT NULL,
  costo_nuevo_cent INTEGER NOT NULL,
  origen_doc TEXT NOT NULL DEFAULT '',
  origen_id INTEGER,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_existencias_empresa ON existencias(empresa_id, almacen_id);
CREATE INDEX IF NOT EXISTS idx_existencias_producto ON existencias(empresa_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_kardex_empresa_fecha ON movimientos_inventario(empresa_id, fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_producto ON movimientos_inventario(empresa_id, producto_id, id);
CREATE INDEX IF NOT EXISTS idx_kardex_almacen ON movimientos_inventario(empresa_id, almacen_id, id);
CREATE INDEX IF NOT EXISTS idx_kardex_documento ON movimientos_inventario(empresa_id, doc_tipo, doc_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_empresa ON transferencias(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ajustes_empresa ON ajustes_inventario(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_series_producto ON series_producto(empresa_id, producto_id, estado);
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON lotes_producto(empresa_id, producto_id, vencimiento);
CREATE INDEX IF NOT EXISTS idx_costos_historial ON costos_historial(empresa_id, producto_id, fecha DESC);

INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'AJUSTE_INVENTARIO', '', 'AJU-', 1, 8, 1 FROM empresas;

INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'TRANSFERENCIA_INVENTARIO', '', 'TRF-', 1, 8, 1 FROM empresas;
`
