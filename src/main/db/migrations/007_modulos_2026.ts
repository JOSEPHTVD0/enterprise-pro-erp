/** Versión 0.3.0 — Planificación, servicios, activos fijos y CRM. Dinero en centavos. */
export const modulos2026Sql = `
-- Presupuestos internos por periodo y centro de costo (no sustituye a las cotizaciones).
CREATE TABLE IF NOT EXISTS presupuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  nombre TEXT NOT NULL,
  periodo TEXT NOT NULL,
  centro_costo TEXT NOT NULL DEFAULT 'GENERAL',
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','APROBADO','CERRADO','ANULADO')),
  monto_cent INTEGER NOT NULL DEFAULT 0 CHECK (monto_cent >= 0),
  ejecutado_cent INTEGER NOT NULL DEFAULT 0 CHECK (ejecutado_cent >= 0),
  observaciones TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS presupuesto_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  presupuesto_id INTEGER NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto_cent INTEGER NOT NULL CHECK (monto_cent >= 0),
  ejecutado_cent INTEGER NOT NULL DEFAULT 0 CHECK (ejecutado_cent >= 0),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Catálogo de servicios y órdenes de trabajo.
CREATE TABLE IF NOT EXISTS servicios_catalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio_cent INTEGER NOT NULL DEFAULT 0 CHECK (precio_cent >= 0),
  duracion_min INTEGER NOT NULL DEFAULT 60 CHECK (duracion_min >= 0),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS ordenes_servicio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  cliente_nombre TEXT NOT NULL,
  tecnico_id INTEGER REFERENCES usuarios(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  fecha_compromiso TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'RECIBIDA' CHECK (estado IN (
    'RECIBIDA','EN_PROCESO','PENDIENTE_CLIENTE','FINALIZADA','ENTREGADA','ANULADA'
  )),
  prioridad TEXT NOT NULL DEFAULT 'NORMAL' CHECK (prioridad IN ('BAJA','NORMAL','ALTA','URGENTE')),
  subtotal_cent INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cent >= 0),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  total_cent INTEGER NOT NULL DEFAULT 0 CHECK (total_cent >= 0),
  diagnostico TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS orden_servicio_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  orden_id INTEGER NOT NULL REFERENCES ordenes_servicio(id) ON DELETE CASCADE,
  servicio_id INTEGER NOT NULL REFERENCES servicios_catalogo(id),
  descripcion TEXT NOT NULL,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_cent INTEGER NOT NULL CHECK (precio_cent >= 0),
  total_cent INTEGER NOT NULL CHECK (total_cent >= 0),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activos fijos con depreciación lineal mensual trazable.
CREATE TABLE IF NOT EXISTS activos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'EQUIPO' CHECK (categoria IN (
    'EQUIPO','MOBILIARIO','VEHICULO','INMUEBLE','SOFTWARE','OTRO'
  )),
  codigo_interno TEXT NOT NULL DEFAULT '',
  ubicacion TEXT NOT NULL DEFAULT '',
  responsable_id INTEGER REFERENCES usuarios(id),
  fecha_compra TEXT NOT NULL DEFAULT (date('now')),
  valor_adquisicion_cent INTEGER NOT NULL CHECK (valor_adquisicion_cent >= 0),
  valor_residual_cent INTEGER NOT NULL DEFAULT 0 CHECK (valor_residual_cent >= 0),
  vida_util_meses INTEGER NOT NULL DEFAULT 60 CHECK (vida_util_meses BETWEEN 1 AND 600),
  depreciacion_acumulada_cent INTEGER NOT NULL DEFAULT 0 CHECK (depreciacion_acumulada_cent >= 0),
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','EN_REPARACION','BAJA')),
  observaciones TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS activos_depreciaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  activo_id INTEGER NOT NULL REFERENCES activos(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  monto_cent INTEGER NOT NULL CHECK (monto_cent >= 0),
  saldo_cent INTEGER NOT NULL CHECK (saldo_cent >= 0),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (activo_id, periodo)
);

-- CRM de oportunidades con seguimiento y conversión a cliente real.
CREATE TABLE IF NOT EXISTS crm_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  nombre TEXT NOT NULL,
  empresa TEXT NOT NULL DEFAULT '',
  rnc_cedula TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  origen TEXT NOT NULL DEFAULT 'OTRO' CHECK (origen IN ('WEB','REFERIDO','LLAMADA','REDES','EVENTO','OTRO')),
  estado TEXT NOT NULL DEFAULT 'NUEVO' CHECK (estado IN (
    'NUEVO','CONTACTADO','CALIFICADO','PROPUESTA','NEGOCIACION','GANADO','PERDIDO'
  )),
  probabilidad INTEGER NOT NULL DEFAULT 10 CHECK (probabilidad BETWEEN 0 AND 100),
  valor_estimado_cent INTEGER NOT NULL DEFAULT 0 CHECK (valor_estimado_cent >= 0),
  responsable_id INTEGER REFERENCES usuarios(id),
  proximo_seguimiento TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS crm_seguimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  lead_id INTEGER NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  tipo TEXT NOT NULL DEFAULT 'LLAMADA' CHECK (tipo IN ('LLAMADA','EMAIL','VISITA','MENSAJE','OTRO')),
  descripcion TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_empresa_periodo ON presupuestos(empresa_id, periodo DESC);
CREATE INDEX IF NOT EXISTS idx_presupuesto_lineas_padre ON presupuesto_lineas(empresa_id, presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_servicio_estado ON ordenes_servicio(empresa_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_orden_servicio_lineas_padre ON orden_servicio_lineas(empresa_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_activos_estado ON activos(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_activos_depreciaciones_periodo ON activos_depreciaciones(empresa_id, periodo);
CREATE INDEX IF NOT EXISTS idx_crm_leads_estado ON crm_leads(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_crm_seguimientos_lead ON crm_seguimientos(empresa_id, lead_id);

INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'PRESUPUESTO', '', 'PRE-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'ORDEN_SERVICIO', '', 'OS-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'ACTIVO', '', 'ACT-', 1, 8, 1 FROM empresas;
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'LEAD', '', 'LED-', 1, 8, 1 FROM empresas;
`
