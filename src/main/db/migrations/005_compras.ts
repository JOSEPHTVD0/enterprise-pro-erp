/** Fase 7 — Compras, recepciones, CxP y pagos. Dinero en centavos; NCF del proveedor nunca se genera. */
export const comprasSql = `
CREATE TABLE IF NOT EXISTS documentos_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'SOLICITUD_COMPRA','ORDEN_COMPRA','RECEPCION','FACTURA_COMPRA','DEVOLUCION_COMPRA'
  )),
  numero TEXT NOT NULL,
  numero_proveedor TEXT NOT NULL DEFAULT '',
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  proveedor_nombre TEXT NOT NULL,
  proveedor_rnc TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL DEFAULT (date('now')),
  vencimiento TEXT NOT NULL DEFAULT '',
  almacen_id INTEGER REFERENCES almacenes(id),
  condicion TEXT NOT NULL DEFAULT 'CONTADO' CHECK (condicion IN ('CONTADO','CREDITO')),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN (
    'PENDIENTE','APROBADA','PARCIAL','COMPLETO','CONTABILIZADO','CONVERTIDA','ANULADO'
  )),
  subtotal_cent INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cent >= 0),
  descuento_cent INTEGER NOT NULL DEFAULT 0 CHECK (descuento_cent >= 0),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  gasto_cent INTEGER NOT NULL DEFAULT 0 CHECK (gasto_cent >= 0),
  total_cent INTEGER NOT NULL DEFAULT 0 CHECK (total_cent >= 0),
  costo_total_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_total_cent >= 0),
  doc_origen_id INTEGER REFERENCES documentos_compra(id),
  motivo TEXT NOT NULL DEFAULT '',
  comentarios TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, tipo, numero)
);

CREATE TABLE IF NOT EXISTS documento_compra_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  cantidad_recibida REAL NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  cantidad_devuelta REAL NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
  precio_cent INTEGER NOT NULL CHECK (precio_cent >= 0),
  descuento_pct_bp INTEGER NOT NULL DEFAULT 0 CHECK (descuento_pct_bp BETWEEN 0 AND 10000),
  descuento_cent INTEGER NOT NULL DEFAULT 0 CHECK (descuento_cent >= 0),
  gasto_cent INTEGER NOT NULL DEFAULT 0 CHECK (gasto_cent >= 0),
  impuesto_id INTEGER REFERENCES impuestos(id),
  impuesto_codigo TEXT NOT NULL DEFAULT '',
  tasa_bp INTEGER NOT NULL DEFAULT 0 CHECK (tasa_bp BETWEEN 0 AND 10000),
  exento INTEGER NOT NULL DEFAULT 0 CHECK (exento IN (0,1)),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  subtotal_cent INTEGER NOT NULL CHECK (subtotal_cent >= 0),
  total_cent INTEGER NOT NULL CHECK (total_cent >= 0),
  costo_unit_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_unit_cent >= 0),
  numero_serie TEXT NOT NULL DEFAULT '',
  lote TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagos_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  metodo TEXT NOT NULL CHECK (metodo IN ('EFECTIVO','TARJETA','TRANSFERENCIA','CHEQUE','OTRO')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  referencia TEXT NOT NULL DEFAULT '',
  caja_sesion_id INTEGER REFERENCES caja_sesiones(id),
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cxp_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  doc_compra_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  numero_documento TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  vencimiento TEXT NOT NULL DEFAULT '',
  monto_cent INTEGER NOT NULL CHECK (monto_cent >= 0),
  saldo_cent INTEGER NOT NULL DEFAULT 0 CHECK (saldo_cent >= 0),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADO','ANULADO')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, doc_compra_id)
);

CREATE TABLE IF NOT EXISTS cxp_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  cxp_documento_id INTEGER REFERENCES cxp_documentos(id),
  doc_compra_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('CARGO','ABONO','ANULACION')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  referencia TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_docs_compra_empresa_fecha ON documentos_compra(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_docs_compra_proveedor ON documentos_compra(empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_docs_compra_origen ON documentos_compra(empresa_id, doc_origen_id);
CREATE INDEX IF NOT EXISTS idx_lineas_compra_doc ON documento_compra_lineas(empresa_id, doc_id);
CREATE INDEX IF NOT EXISTS idx_pagos_compra_doc ON pagos_compra(empresa_id, doc_id);
CREATE INDEX IF NOT EXISTS idx_cxp_documentos_proveedor ON cxp_documentos(empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cxp_movimientos_proveedor ON cxp_movimientos(empresa_id, proveedor_id);

-- Las series ya existen para la empresa inicial; las empresas creadas antes de esta
-- migración también deben recibirlas (el seed solo siembra la empresa 1).
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'SOLICITUD_COMPRA', '', 'SOL-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'ORDEN_COMPRA', '', 'OC-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'RECEPCION', '', 'REC-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'FACTURA_COMPRA', '', 'FCO-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'DEVOLUCION_COMPRA', '', 'DCO-', 1, 8, 1 FROM empresas;
`
