import { planCuentasBase, padresPlanCuentasBase } from '../../../shared/contabilidad'
import { permissionCatalog } from '../../../shared/permissions'

/**
 * Versión 0.5.10 (local, sin publicar) — Ingreso de mercancía sobre compras.
 *
 * No reescribe migraciones aplicadas: añade columnas con valores por defecto
 * compatibles, backfill de filas históricas, desglose de impuestos por tasa,
 * versiones, reimpresiones y los permisos finos nuevos.
 */
const sqlLiteral = (valor: string): string => `'${valor.replace(/'/g, "''")}'`

const nuevasPermisos = permissionCatalog
  .filter((p) => [
    'compras.descuento', 'compras.tasa', 'compras.almacen', 'compras.historial'
  ].includes(p.key))
  .map((p) => `
INSERT OR IGNORE INTO permisos (clave, modulo, operacion, etiqueta, descripcion, critico, creado_en)
VALUES (${sqlLiteral(p.key)}, ${sqlLiteral(p.module)}, ${sqlLiteral(p.operation)},
        ${sqlLiteral(p.label)}, ${sqlLiteral(p.descripcion)}, ${p.critico ? 1 : 0}, datetime('now'));
`).join('\n')

const cuentaItbisCompras = planCuentasBase.find((c) => c.codigo === '4120')
const padreItbisCompras = padresPlanCuentasBase['4120']

if (!cuentaItbisCompras || !padreItbisCompras) {
  throw new Error('La cuenta contable 4120 de compras no está definida en el plan base.')
}

export const ingresoMercanciaSql = `
ALTER TABLE documentos_compra ADD COLUMN moneda_codigo TEXT NOT NULL DEFAULT 'DOP';
ALTER TABLE documentos_compra ADD COLUMN tasa_aplicada REAL NOT NULL DEFAULT 1;
ALTER TABLE documentos_compra ADD COLUMN monto_factura_moneda_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN monto_factura_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN diferencia_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN motivo_diferencia TEXT NOT NULL DEFAULT '';
ALTER TABLE documentos_compra ADD COLUMN ajuste_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN flete_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN descuento1_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN descuento2_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN descuento_items_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN base_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN exento_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN gravado_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documentos_compra ADD COLUMN clasificacion_contable TEXT NOT NULL DEFAULT '1200';
ALTER TABLE documentos_compra ADD COLUMN numero_orden_compra TEXT NOT NULL DEFAULT '';
ALTER TABLE documentos_compra ADD COLUMN fecha_llegada TEXT NOT NULL DEFAULT '';
ALTER TABLE documentos_compra ADD COLUMN nota TEXT NOT NULL DEFAULT '';
ALTER TABLE documentos_compra ADD COLUMN asiento_id INTEGER;

ALTER TABLE documento_compra_lineas ADD COLUMN descuento1_pct_bp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN descuento1_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN descuento2_pct_bp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN descuento2_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN descuento3_pct_bp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN descuento3_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN base_cent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento_compra_lineas ADD COLUMN referencia TEXT NOT NULL DEFAULT '';
ALTER TABLE documento_compra_lineas ADD COLUMN pvs_cent INTEGER NOT NULL DEFAULT 0;

UPDATE documento_compra_lineas
   SET descuento1_pct_bp = descuento_pct_bp,
       descuento1_cent = descuento_cent,
       base_cent = MAX(0, subtotal_cent - descuento_cent);

UPDATE documentos_compra
   SET monto_factura_cent = total_cent,
       flete_cent = gasto_cent,
       descuento_items_cent = descuento_cent,
       descuento1_cent = descuento_cent,
       base_cent = MAX(0, subtotal_cent - descuento_cent),
       gravado_cent = COALESCE((
         SELECT SUM(MAX(0, l.subtotal_cent - l.descuento_cent)) FROM documento_compra_lineas l
          WHERE l.doc_id = documentos_compra.id AND l.exento = 0
       ), 0),
       exento_cent = COALESCE((
         SELECT SUM(MAX(0, l.subtotal_cent - l.descuento_cent)) FROM documento_compra_lineas l
          WHERE l.doc_id = documentos_compra.id AND l.exento = 1
       ), 0);

CREATE TABLE IF NOT EXISTS documento_compra_impuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  impuesto_id INTEGER REFERENCES impuestos(id),
  codigo TEXT NOT NULL DEFAULT '',
  tasa_bp INTEGER NOT NULL DEFAULT 0 CHECK (tasa_bp BETWEEN 0 AND 10000),
  base_cent INTEGER NOT NULL DEFAULT 0 CHECK (base_cent >= 0),
  impuesto_cent INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_cent >= 0),
  exento INTEGER NOT NULL DEFAULT 0 CHECK (exento IN (0,1)),
  UNIQUE (empresa_id, doc_id, codigo, tasa_bp, exento)
);

INSERT OR IGNORE INTO documento_compra_impuestos
  (empresa_id, doc_id, impuesto_id, codigo, tasa_bp, base_cent, impuesto_cent, exento)
SELECT empresa_id, doc_id, impuesto_id, impuesto_codigo, tasa_bp,
       SUM(MAX(0, subtotal_cent - descuento_cent)), SUM(impuesto_cent), exento
  FROM documento_compra_lineas
 GROUP BY empresa_id, doc_id, impuesto_id, impuesto_codigo, tasa_bp, exento;

CREATE TABLE IF NOT EXISTS compra_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  numero TEXT NOT NULL DEFAULT '',
  operacion TEXT NOT NULL CHECK (operacion IN ('CREAR','MODIFICAR','ANULAR','IMPRIMIR')),
  valores_antes TEXT NOT NULL DEFAULT '',
  valores_despues TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compra_reimpresiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  doc_id INTEGER NOT NULL REFERENCES documentos_compra(id),
  formato TEXT NOT NULL DEFAULT 'CARTA',
  motivo TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  sesion_id INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documento_compra_impuestos_doc
  ON documento_compra_impuestos(empresa_id, doc_id);
CREATE INDEX IF NOT EXISTS idx_compra_versiones_doc
  ON compra_versiones(empresa_id, doc_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_compra_reimpresiones_doc
  ON compra_reimpresiones(empresa_id, doc_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_compra_numero_proveedor
  ON documentos_compra(empresa_id, tipo, numero_proveedor);
CREATE INDEX IF NOT EXISTS idx_documentos_compra_almacen_usuario
  ON documentos_compra(empresa_id, almacen_id, usuario_id, fecha DESC);

INSERT OR IGNORE INTO plan_cuentas
  (empresa_id, codigo, nombre, tipo, naturaleza, padre_id, nivel, acepta_movimiento, activa)
SELECT e.id, ${sqlLiteral(cuentaItbisCompras.codigo)}, ${sqlLiteral(cuentaItbisCompras.nombre)},
       ${sqlLiteral(cuentaItbisCompras.tipo)}, ${sqlLiteral(cuentaItbisCompras.naturaleza)},
       (SELECT id FROM plan_cuentas WHERE empresa_id = e.id AND codigo = ${sqlLiteral(padreItbisCompras)}),
       ${cuentaItbisCompras.nivel}, ${cuentaItbisCompras.aceptaMovimiento ? 1 : 0}, 1
  FROM empresas e;

${nuevasPermisos}

INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permisos p ON p.clave IN (
    'compras.descuento', 'compras.tasa', 'compras.almacen', 'compras.historial'
  )
 WHERE r.nombre IN ('Administrador', 'Gerente');
`
