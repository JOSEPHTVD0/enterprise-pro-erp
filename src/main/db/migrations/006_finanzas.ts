/** Fase 8 — Finanzas. CxC/CxP multi-factura, bancos, caja, gastos y comisiones. Dinero en centavos. */
export const finanzasSql = `
CREATE TABLE IF NOT EXISTS bancos_cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  banco TEXT NOT NULL DEFAULT '',
  numero_cuenta TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'CORRIENTE' CHECK (tipo IN ('CORRIENTE','AHORROS','EFECTIVO')),
  saldo_inicial_cent INTEGER NOT NULL DEFAULT 0,
  saldo_cent INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS bancos_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cuenta_id INTEGER NOT NULL REFERENCES bancos_cuentas(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'DEPOSITO','RETIRO','TRANSFERENCIA','CHEQUE','CARGO','INTERES','AJUSTE'
  )),
  monto_cent INTEGER NOT NULL CHECK (monto_cent <> 0),
  conciliado INTEGER NOT NULL DEFAULT 0 CHECK (conciliado IN (0,1)),
  referencia TEXT NOT NULL DEFAULT '',
  doc_tipo TEXT NOT NULL DEFAULT '',
  doc_id INTEGER,
  descripcion TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bancos_conciliaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cuenta_id INTEGER NOT NULL REFERENCES bancos_cuentas(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  periodo_desde TEXT NOT NULL DEFAULT '',
  periodo_hasta TEXT NOT NULL DEFAULT '',
  saldo_banco_cent INTEGER NOT NULL DEFAULT 0,
  saldo_libro_cent INTEGER NOT NULL DEFAULT 0,
  diferencia_cent INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','CONCILIADO')),
  observaciones TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bancos_conciliacion_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  conciliacion_id INTEGER NOT NULL REFERENCES bancos_conciliaciones(id),
  movimiento_id INTEGER NOT NULL REFERENCES bancos_movimientos(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (conciliacion_id, movimiento_id)
);

CREATE TABLE IF NOT EXISTS cxc_recibos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  cliente_nombre TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  metodo TEXT NOT NULL DEFAULT 'EFECTIVO' CHECK (metodo IN (
    'EFECTIVO','TARJETA','TRANSFERENCIA','CHEQUE','OTRO'
  )),
  referencia TEXT NOT NULL DEFAULT '',
  anticipo_id INTEGER,
  caja_sesion_id INTEGER REFERENCES caja_sesiones(id),
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  banco_cuenta_id INTEGER REFERENCES bancos_cuentas(id),
  banco_movimiento_id INTEGER REFERENCES bancos_movimientos(id),
  estado TEXT NOT NULL DEFAULT 'CONTABILIZADO' CHECK (estado IN ('CONTABILIZADO','ANULADO')),
  comentarios TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS cxc_recibo_aplicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  recibo_id INTEGER NOT NULL REFERENCES cxc_recibos(id),
  cxc_documento_id INTEGER NOT NULL REFERENCES cxc_documentos(id),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cxp_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  proveedor_nombre TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  metodo TEXT NOT NULL DEFAULT 'EFECTIVO' CHECK (metodo IN (
    'EFECTIVO','TARJETA','TRANSFERENCIA','CHEQUE','OTRO'
  )),
  referencia TEXT NOT NULL DEFAULT '',
  anticipo_id INTEGER,
  caja_sesion_id INTEGER REFERENCES caja_sesiones(id),
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  banco_cuenta_id INTEGER REFERENCES bancos_cuentas(id),
  banco_movimiento_id INTEGER REFERENCES bancos_movimientos(id),
  estado TEXT NOT NULL DEFAULT 'CONTABILIZADO' CHECK (estado IN ('CONTABILIZADO','ANULADO')),
  comentarios TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS cxp_pago_aplicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  pago_id INTEGER NOT NULL REFERENCES cxp_pagos(id),
  cxp_documento_id INTEGER NOT NULL REFERENCES cxp_documentos(id),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS anticipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('CLIENTE','PROVEEDOR')),
  entidad_id INTEGER NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  saldo_cent INTEGER NOT NULL CHECK (saldo_cent >= 0),
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','APLICADO','ANULADO')),
  referencia TEXT NOT NULL DEFAULT '',
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  banco_movimiento_id INTEGER REFERENCES bancos_movimientos(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gastos_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES gastos_categorias(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  concepto TEXT NOT NULL,
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  total_cent INTEGER NOT NULL CHECK (total_cent > 0),
  metodo TEXT NOT NULL DEFAULT 'EFECTIVO' CHECK (metodo IN ('EFECTIVO','BANCO')),
  recurrente_id INTEGER,
  caja_sesion_id INTEGER REFERENCES caja_sesiones(id),
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  banco_cuenta_id INTEGER REFERENCES bancos_cuentas(id),
  banco_movimiento_id INTEGER REFERENCES bancos_movimientos(id),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','CONTABILIZADO','ANULADO')),
  doc_referencia TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS gastos_recurrentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  categoria_id INTEGER NOT NULL REFERENCES gastos_categorias(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  concepto TEXT NOT NULL,
  monto_cent INTEGER NOT NULL CHECK (monto_cent > 0),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  frecuencia TEXT NOT NULL DEFAULT 'MENSUAL' CHECK (frecuencia IN ('SEMANAL','MENSUAL','TRIMESTRAL','ANUAL')),
  proxima_fecha TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comisiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
  doc_venta_id INTEGER NOT NULL REFERENCES documentos_venta(id),
  base_cent INTEGER NOT NULL CHECK (base_cent >= 0),
  pct_bp INTEGER NOT NULL CHECK (pct_bp BETWEEN 0 AND 10000),
  monto_cent INTEGER NOT NULL CHECK (monto_cent >= 0),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADA','ANULADA')),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  fecha_pago TEXT NOT NULL DEFAULT '',
  pago_referencia TEXT NOT NULL DEFAULT '',
  metodo TEXT NOT NULL DEFAULT 'EFECTIVO' CHECK (metodo IN ('EFECTIVO','BANCO')),
  caja_movimiento_id INTEGER REFERENCES caja_movimientos(id),
  banco_movimiento_id INTEGER REFERENCES bancos_movimientos(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, doc_venta_id, vendedor_id)
);

-- Arqueo y cierre de caja de la Fase 8 (la Fase 6 ya creaba las sesiones).
ALTER TABLE caja_sesiones ADD COLUMN arqueo_efectivo_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caja_sesiones ADD COLUMN arqueo_otros_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caja_sesiones ADD COLUMN usuario_cierre_id INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_bancos_movimientos_cuenta_fecha ON bancos_movimientos(empresa_id, cuenta_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cxc_recibos_cliente ON cxc_recibos(empresa_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_cxc_recibo_aplicaciones_doc ON cxc_recibo_aplicaciones(empresa_id, cxc_documento_id);
CREATE INDEX IF NOT EXISTS idx_cxp_pagos_proveedor ON cxp_pagos(empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cxp_pago_aplicaciones_doc ON cxp_pago_aplicaciones(empresa_id, cxp_documento_id);
CREATE INDEX IF NOT EXISTS idx_anticipos_entidad ON anticipos(empresa_id, tipo, entidad_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_comisiones_vendedor ON comisiones(empresa_id, vendedor_id);

-- Series internas para empresas creadas antes de esta migración.
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'PAGO_CXP', '', 'PAG-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'GASTO', '', 'GAS-', 1, 8, 1 FROM empresas;
`
