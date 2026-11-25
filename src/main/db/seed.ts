import type { Db } from './connection'
import { hashPassword } from '../core/password'
import { permissionCatalog, permissionKeys, seedRoles } from '@shared/permissions'
import { documentTypes } from '@shared/document-types'
import { seedPlanContable } from '../repositories/contabilidad.repo'

/** Credencial de primer arranque. Debe cambiarse obligatoriamente en el primer login. */
export const FIRST_RUN_USER = 'admin'
export const FIRST_RUN_PASSWORD = 'Admin1234!'

const series: { tipo: string; prefijo: string }[] = [
  { tipo: 'FACTURA_CONTADO', prefijo: 'FAC-' },
  { tipo: 'FACTURA_CREDITO', prefijo: 'FCR-' },
  { tipo: 'POS', prefijo: 'POS-' },
  { tipo: 'COTIZACION', prefijo: 'COT-' },
  { tipo: 'PEDIDO', prefijo: 'PED-' },
  { tipo: 'NOTA_CREDITO', prefijo: 'NC-' },
  { tipo: 'NOTA_DEBITO', prefijo: 'ND-' },
  { tipo: 'DEVOLUCION_VENTA', prefijo: 'DEV-' },
  { tipo: 'RECIBO_INGRESO', prefijo: 'RIN-' },
  { tipo: 'CONDUCE', prefijo: 'CON-' },
  { tipo: 'SOLICITUD_COMPRA', prefijo: 'SOL-' },
  { tipo: 'ORDEN_COMPRA', prefijo: 'OC-' },
  { tipo: 'RECEPCION', prefijo: 'REC-' },
  { tipo: 'FACTURA_COMPRA', prefijo: 'FCO-' },
  { tipo: 'DEVOLUCION_COMPRA', prefijo: 'DCO-' },
  { tipo: 'PAGO_CXP', prefijo: 'PAG-' },
  { tipo: 'GASTO', prefijo: 'GAS-' },
  { tipo: 'PRESUPUESTO', prefijo: 'PRE-' },
  { tipo: 'ORDEN_SERVICIO', prefijo: 'OS-' },
  { tipo: 'ACTIVO', prefijo: 'ACT-' },
  { tipo: 'LEAD', prefijo: 'LED-' },
  { tipo: 'ASIENTO', prefijo: 'ASI-' }
]

/** Configuración estructural de una empresa. Se reutiliza al crear empresas nuevas. */
export function seedCompany(db: Db, empresaId: number): void {
  const params: [string, string][] = [
    ['decimales_dinero', '2'],
    ['permitir_stock_negativo', 'false'],
    ['formato_fecha', 'dd/MM/yyyy'],
    ['separador_miles', ','],
    ['separador_decimal', '.'],
    ['itbis_por_defecto', 'ITBIS18'],
    ['imprimir_automaticamente', 'false'],
    ['backup_frecuencia', 'DIARIO'],
    ['backup_hora', '02:00'],
    ['backup_carpeta', ''],
    ['backup_retencion_dias', '30'],
    ['presupuesto_alerta_pct', '80'],
    ['servicio_itbis_default', 'ITBIS18'],
    ['crm_dias_seguimiento', '3'],
    ['activos_depreciacion_mensual', 'true']
  ]
  const addParam = db.prepare('INSERT OR IGNORE INTO parametros (empresa_id, clave, valor) VALUES (?, ?, ?)')
  for (const [clave, valor] of params) addParam.run(empresaId, clave, valor)

  db.prepare('INSERT OR IGNORE INTO monedas (empresa_id, codigo, nombre, simbolo, decimales) VALUES (?, ?, ?, ?, ?)')
    .run(empresaId, 'DOP', 'Peso dominicano', 'RD$', 2)

  const addImpuesto = db.prepare('INSERT OR IGNORE INTO impuestos (empresa_id, codigo, descripcion, tasa_bp, exento) VALUES (?, ?, ?, ?, ?)')
  addImpuesto.run(empresaId, 'ITBIS18', 'ITBIS 18%', 1800, 0)
  addImpuesto.run(empresaId, 'EXENTO', 'Exento de ITBIS', 0, 1)

  const addSerie = db.prepare(`
    INSERT OR IGNORE INTO series_documento
      (empresa_id, tipo_doc, serie, prefijo, siguiente, longitud, activa)
    VALUES (?, ?, '', ?, 1, 8, 1)
  `)
  for (const s of series) addSerie.run(empresaId, s.tipo, s.prefijo)
  // Series internas de inventario (Fase 5). La migración 003 las crea para empresas ya existentes.
  addSerie.run(empresaId, 'AJUSTE_INVENTARIO', 'AJU-')
  addSerie.run(empresaId, 'TRANSFERENCIA_INVENTARIO', 'TRF-')
  for (const t of documentTypes) {
    const exists = db.prepare('SELECT 1 FROM series_documento WHERE empresa_id = ? AND tipo_doc = ?').get(empresaId, t)
    if (!exists) addSerie.run(empresaId, t, `${t.substring(0, 3)}-`)
  }

  db.prepare('INSERT OR IGNORE INTO almacenes (empresa_id, codigo, nombre, principal) VALUES (?, ?, ?, 1)')
    .run(empresaId, 'PRINCIPAL', 'Almacén principal')
  db.prepare('INSERT OR IGNORE INTO cajas (empresa_id, codigo, nombre) VALUES (?, ?, ?)')
    .run(empresaId, 'PRINCIPAL', 'Caja principal')
  seedPlanContable(db, empresaId)
  db.prepare(`
    WITH RECURSIVE meses(mes) AS (SELECT 1 UNION ALL SELECT mes + 1 FROM meses WHERE mes < 12)
    INSERT OR IGNORE INTO periodos_contables (empresa_id, anio, mes, estado)
    SELECT ?, CAST(strftime('%Y','now') AS INTEGER), mes, 'ABIERTO' FROM meses
  `).run(empresaId)
}

/** Crea los roles y sus permisos para una empresa. */
export function seedRolesForCompany(db: Db, empresaId: number): void {
  const addPerm = db.prepare('INSERT OR IGNORE INTO permisos (clave, modulo, operacion, etiqueta) VALUES (?, ?, ?, ?)')
  for (const p of permissionCatalog) addPerm.run(p.key, p.module, p.operation, p.label)

  const addRol = db.prepare('INSERT OR IGNORE INTO roles (empresa_id, nombre, descripcion) VALUES (?, ?, ?)')
  for (const r of seedRoles) addRol.run(empresaId, r.name, r.description)

  const permisoId = db.prepare('SELECT id FROM permisos WHERE clave = ?')
  const rolId = db.prepare('SELECT id FROM roles WHERE empresa_id = ? AND nombre = ?')
  const addRolPerm = db.prepare('INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)')
  for (const r of seedRoles) {
    const rid = (rolId.get(empresaId, r.name) as { id: number }).id
    for (const key of permissionKeys.filter(r.permissionFilter)) {
      const perm = permisoId.get(key) as { id: number } | undefined
      if (perm) addRolPerm.run(rid, perm.id)
    }
  }
}

/** Datos estructurales necesarios para operar. No son datos de demostración comercial. */
export function seed(db: Db): void {
  db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO empresas (id, nombre_comercial, razon_social, moneda_base)
      VALUES (1, 'EMPRESA SIN CONFIGURAR', 'EMPRESA SIN CONFIGURAR', 'DOP')
    `).run()
    seedCompany(db, 1)
    seedRolesForCompany(db, 1)

    const adminExists = db.prepare('SELECT 1 FROM usuarios WHERE username = ?').get(FIRST_RUN_USER)
    if (!adminExists) {
      const { hash, salt } = hashPassword(FIRST_RUN_PASSWORD)
      const result = db.prepare(`
        INSERT INTO usuarios (username, nombre, email, password_hash, salt, debe_cambiar_clave)
        VALUES (?, 'ADMINISTRADOR', '', ?, ?, 1)
      `).run(FIRST_RUN_USER, hash, salt)
      const adminId = Number(result.lastInsertRowid)
      const adminRol = (db.prepare('SELECT id FROM roles WHERE empresa_id = 1 AND nombre = ?').get('Administrador') as { id: number }).id
      db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id, empresa_id) VALUES (?, ?, 1)').run(adminId, adminRol)
    }
  })()
}
