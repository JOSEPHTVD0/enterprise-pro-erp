/** Fase 6 — Ventas, POS y libros auxiliares mínimos de CxC y caja. Dinero en centavos. */
export const ventasSql = `
CREATE TABLE IF NOT EXISTS documentos_venta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'FACTURA_CONTADO','FACTURA_CREDITO','POS','COTIZACION','PEDIDO',
    'NOTA_CREDITO','NOTA_DEBITO','DEVOLUCION_VENTA','CONDUCE'
  )),
  numero TEXT NOT NULL,
  es_ncf INTEGER NOT NULL DEFAULT 0 CHECK (es_ncf IN (0,1)),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  cliente_nombre TEXT NOT NULL,
  cliente_rnc TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL DEFAULT (date('now')),
  vencimiento TEXT NOT NULL DEFAULT '',
  vendedor_id INTEGER REFERENCES vendedores(id),
  almacen_id INTEGER REFERENCES almacenes(id),
  condicion TEXT NOT NULL DEFAULT 'CONTADO' CHECK (condicion IN ('CONTADO','CREDITO')),
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN (
    'ACTIVO','PENDIENTE','APROBADA','CONTABILIZADO','CONVERTIDA','ANULADO','VENCIDA'
  )),
  subtotal_cent INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cent >= 0),
  descuento_cent INTEGER NOT NULL DEFAULT 0 CHECK (descuento_cent >= 0),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  total_cent INTEGER NOT NULL DEFAULT 0 CHECK (total_cent >= 0),
  costo_total_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_total_cent >= 0),
  doc_origen_id INTEGER REFERENCES documentos_venta(id),
  motivo TEXT NOT NULL DEFAULT '',
  comentarios TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, tipo, numero)
);

CREATE TABLE IF NOT EXISTS documento_venta_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_venta(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  cantidad_entregada REAL NOT NULL DEFAULT 0 CHECK (cantidad_entregada >= 0),
  precio_cent INTEGER NOT NULL CHECK (precio_cent >= 0),
  descuento_pct_bp INTEGER NOT NULL DEFAULT 0 CHECK (descuento_pct_bp BETWEEN 0 AND 10000),
  descuento_cent INTEGER NOT NULL DEFAULT 0 CHECK (descuento_cent >= 0),
  impuesto_id INTEGER REFERENCES impuestos(id),
  impuesto_codigo TEXT NOT NULL DEFAULT '',
  tasa_bp INTEGER NOT NULL DEFAULT 0 CHECK (tasa_bp BETWEEN 0 AND 10000),
  exento INTEGER NOT NULL DEFAULT 0 CHECK (exento IN (0,1)),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  costo_unit_cent INTEGER NOT NULL DEFAULT 0 CHECK (costo_unit_cent >= 0),
  subtotal_cent INTEGER NOT NULL CHECK (subtotal_cent >= 0),
  total_cent INTEGER NOT NULL CHECK (total_cent >= 0),
  numero_serie TEXT NOT NULL DEFAULT '',
  lote TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caja_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  caja_id INTEGER NOT NULL REFERENCES cajas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_apertura TEXT NOT NULL DEFAULT (datetime('now')),
  fecha_cierre TEXT NOT NULL DEFAULT '',
  monto_apertura_cent INTEGER NOT NULL DEFAULT 0 CHECK (monto_apertura_cent >= 0),
  monto_cierre_cent INTEGER NOT NULL DEFAULT 0 CHECK (monto_cierre_cent >= 0),
  diferencia_cent INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','CERRADA')),
  observaciones TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_sesion_abierta
  ON caja_sesiones(empresa_id, caja_id) WHERE estado = 'ABIERTA';

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  caja_sesion_id INTEGER REFERENCES caja_sesiones(id),
  caja_id INTEGER NOT NULL REFERENCES cajas(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
  metodo TEXT NOT NULL DEFAULT 'EFECTIVO',
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  doc_tipo TEXT NOT NULL DEFAULT '',
  doc_id INTEGER,
  descripcion TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS documento_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_venta(id),
  metodo TEXT NOT NULL CHECK (metodo IN ('EFECTIVO','TARJETA','TRANSFERENCIA','CHEQUE','CREDITO','OTRO')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  referencia TEXT NOT NULL DEFAULT '',
  caja_sesion_id INTEGER REFERENCES caja_sesiones(id),
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cxc_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  doc_venta_id INTEGER NOT NULL REFERENCES documentos_venta(id),
  numero_documento TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  vencimiento TEXT NOT NULL DEFAULT '',
  monto_cent INTEGER NOT NULL CHECK (monto_cent >= 0),
  saldo_cent INTEGER NOT NULL DEFAULT 0 CHECK (saldo_cent >= 0),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADO','ANULADO')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, doc_venta_id)
);

CREATE TABLE IF NOT EXISTS cxc_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  cxc_documento_id INTEGER REFERENCES cxc_documentos(id),
  doc_venta_id INTEGER NOT NULL REFERENCES documentos_venta(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('CARGO','ABONO','ANULACION')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  referencia TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS conduces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  doc_venta_id INTEGER NOT NULL REFERENCES documentos_venta(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL DEFAULT 'PARCIAL' CHECK (estado IN ('PARCIAL','COMPLETO','ANULADO')),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS conduce_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  conduce_id INTEGER NOT NULL REFERENCES conduces(id),
  doc_linea_id INTEGER NOT NULL REFERENCES documento_venta_lineas(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventas_suspendidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  caja_id INTEGER REFERENCES cajas(id),
  nombre TEXT NOT NULL,
  payload TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_venta_empresa_fecha ON documentos_venta(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_docs_venta_cliente ON documentos_venta(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_docs_venta_origen ON documentos_venta(empresa_id, doc_origen_id);
CREATE INDEX IF NOT EXISTS idx_lineas_venta_doc ON documento_venta_lineas(empresa_id, doc_id);
CREATE INDEX IF NOT EXISTS idx_pagos_doc ON documento_pagos(empresa_id, doc_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_sesion ON caja_movimientos(empresa_id, caja_sesion_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_doc ON caja_movimientos(empresa_id, doc_tipo, doc_id);
CREATE INDEX IF NOT EXISTS idx_cxc_documentos_cliente ON cxc_documentos(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cxc_movimientos_cliente ON cxc_movimientos(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_conduces_doc ON conduces(empresa_id, doc_venta_id);
CREATE INDEX IF NOT EXISTS idx_conduce_lineas_conduce ON conduce_lineas(empresa_id, conduce_id);
CREATE INDEX IF NOT EXISTS idx_suspendidas_usuario ON ventas_suspendidas(empresa_id, usuario_id);
`
