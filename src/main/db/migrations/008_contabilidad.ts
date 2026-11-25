import { padresPlanCuentasBase, planCuentasBase } from '../../../shared/contabilidad'

/** Versión 0.4.0 — Contabilidad: plan de cuentas, periodos, asientos y reportes. Dinero en centavos. */

const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`

/** El plan base se genera desde la definición compartida, no se duplica a mano. */
const sembrarPlan = planCuentasBase.map((cuenta) => {
  const padreCodigo = padresPlanCuentasBase[cuenta.codigo]
  const padre = padreCodigo
    ? `(SELECT id FROM plan_cuentas WHERE empresa_id = e.id AND codigo = ${sqlLiteral(padreCodigo)})`
    : 'NULL'
  return `INSERT OR IGNORE INTO plan_cuentas
    (empresa_id, codigo, nombre, tipo, naturaleza, padre_id, nivel, acepta_movimiento, activa)
  SELECT e.id, ${sqlLiteral(cuenta.codigo)}, ${sqlLiteral(cuenta.nombre)}, ${sqlLiteral(cuenta.tipo)},
    ${sqlLiteral(cuenta.naturaleza)}, ${padre}, ${cuenta.nivel}, ${cuenta.aceptaMovimiento ? 1 : 0}, 1
  FROM empresas e;`
}).join('\n')

export const contabilidadSql = `
-- Plan de cuentas por empresa. Las cuentas de nivel 1 son cabeceras.
CREATE TABLE IF NOT EXISTS plan_cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO')),
  naturaleza TEXT NOT NULL CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
  padre_id INTEGER REFERENCES plan_cuentas(id),
  nivel INTEGER NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 9),
  acepta_movimiento INTEGER NOT NULL DEFAULT 1 CHECK (acepta_movimiento IN (0,1)),
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, codigo)
);

-- Un periodo por mes y empresa; solo se puede contabilizar en periodos abiertos.
CREATE TABLE IF NOT EXISTS periodos_contables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO','CERRADO')),
  cerrado_en TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS asientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'MANUAL' CHECK (tipo IN (
    'MANUAL','VENTA','COMPRA','PAGO','COBRO','AJUSTE'
  )),
  periodo_id INTEGER REFERENCES periodos_contables(id),
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','CONFIRMADO','ANULADO')),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS asiento_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asiento_id INTEGER NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
  cuenta_id INTEGER NOT NULL REFERENCES plan_cuentas(id),
  debe_centavos INTEGER NOT NULL DEFAULT 0 CHECK (debe_centavos >= 0),
  haber_centavos INTEGER NOT NULL DEFAULT 0 CHECK (haber_centavos >= 0),
  descripcion TEXT NOT NULL DEFAULT '',
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_empresa ON plan_cuentas(empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_plan_cuentas_padre ON plan_cuentas(padre_id);
CREATE INDEX IF NOT EXISTS idx_periodos_contables_empresa ON periodos_contables(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_asientos_empresa_fecha ON asientos(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asientos_empresa_estado ON asientos(empresa_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asientos_periodo ON asientos(periodo_id);
CREATE INDEX IF NOT EXISTS idx_asiento_lineas_asiento ON asiento_lineas(asiento_id);
CREATE INDEX IF NOT EXISTS idx_asiento_lineas_cuenta ON asiento_lineas(cuenta_id);

-- Numeración consecutiva ASI-00000001, ASI-00000002, ... por empresa.
INSERT OR IGNORE INTO series_documento
  (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
SELECT id, 'ASIENTO', '', 'ASI-', 1, 8, 1 FROM empresas;

-- Periodos abiertos del año en curso para todas las empresas existentes.
WITH RECURSIVE meses(mes) AS (
  SELECT 1
  UNION ALL
  SELECT mes + 1 FROM meses WHERE mes < 12
)
INSERT OR IGNORE INTO periodos_contables (empresa_id, anio, mes, estado)
SELECT e.id, CAST(strftime('%Y', 'now') AS INTEGER), meses.mes, 'ABIERTO'
FROM empresas e CROSS JOIN meses;

-- Plan de cuentas base para TODAS las empresas existentes (padres antes que hijos).
${sembrarPlan}
`
