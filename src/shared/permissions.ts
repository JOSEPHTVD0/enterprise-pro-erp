/** Operaciones soportadas por el sistema de permisos. */
export const operations = [
  'consultar', 'crear', 'modificar', 'eliminar', 'anular', 'aprobar', 'imprimir', 'exportar',
  'descuento', 'precio', 'costo', 'ganancia', 'devolucion', 'abrir_caja', 'cerrar_caja'
] as const

export type Operation = (typeof operations)[number]

export const modules = [
  'dashboard', 'configuracion', 'seguridad', 'clientes', 'proveedores', 'productos', 'inventario', 'ventas',
  'pos', 'cotizaciones', 'compras', 'cxc', 'cxp', 'bancos', 'cajas', 'gastos', 'vendedores',
  'reportes', 'auditoria', 'respaldos',
  'presupuestos', 'servicios', 'activos', 'crm', 'salud'
] as const

export type ModuleKey = (typeof modules)[number]

/** Operación → módulos a los que aplica. Evita permisos sin sentido (p. ej. ventas.abrir_caja). */
const operationModules: Record<Operation, readonly ModuleKey[]> = {
  consultar: modules,
  crear: modules.filter((m) => m !== 'dashboard'),
  modificar: modules.filter((m) => m !== 'dashboard'),
  eliminar: modules.filter((m) => m !== 'dashboard'),
  anular: ['ventas', 'compras', 'cxc', 'cxp', 'cotizaciones', 'cajas', 'bancos', 'gastos', 'presupuestos', 'servicios'],
  aprobar: ['cotizaciones', 'compras', 'ventas', 'gastos', 'configuracion', 'presupuestos', 'servicios'],
  imprimir: ['ventas', 'pos', 'cotizaciones', 'compras', 'cxc', 'cxp', 'bancos', 'cajas', 'reportes', 'presupuestos', 'servicios', 'activos'],
  exportar: ['clientes', 'proveedores', 'productos', 'inventario', 'ventas', 'compras', 'cxc', 'cxp', 'vendedores', 'reportes', 'auditoria', 'presupuestos', 'servicios', 'activos', 'crm', 'salud'],
  descuento: ['ventas', 'pos', 'cotizaciones'],
  precio: ['productos', 'ventas', 'pos', 'cotizaciones'],
  costo: ['productos', 'inventario', 'compras', 'reportes'],
  ganancia: ['ventas', 'productos', 'reportes'],
  devolucion: ['ventas', 'compras'],
  abrir_caja: ['cajas', 'pos'],
  cerrar_caja: ['cajas', 'pos']
}

const configResources = [
  'empresa', 'parametros', 'impuestos', 'monedas', 'series',
  'almacenes', 'cajas', 'impresoras', 'formatos'
] as const

const configResourceKeys = configResources.flatMap((r) => [
  `configuracion.${r}.consultar`,
  `configuracion.${r}.modificar`
] as const)

const extraKeys = [
  'seguridad.usuario.restablecer',
  'seguridad.usuario.bloquear',
  'seguridad.permiso.modificar',
  'seguridad.sesion.consultar',
  'configuracion.respaldo.crear',
  'configuracion.respaldo.restaurar',
  'configuracion.empresa.crear',
  'presupuestos.ejecutar',
  'servicios.finalizar',
  'activos.depreciar',
  'crm.convertir',
  ...configResourceKeys
] as const

export interface PermissionDef {
  key: string
  module: ModuleKey
  operation: string
  label: string
}

const spanishModules: Record<ModuleKey, string> = {
  dashboard: 'Panel', configuracion: 'Configuración', seguridad: 'Seguridad',
  clientes: 'Clientes', proveedores: 'Proveedores', productos: 'Productos', inventario: 'Inventario',
  ventas: 'Ventas', pos: 'Punto de Venta', cotizaciones: 'Cotizaciones',
  compras: 'Compras', cxc: 'Cuentas por Cobrar', cxp: 'Cuentas por Pagar',
  bancos: 'Bancos', cajas: 'Cajas', gastos: 'Gastos', vendedores: 'Vendedores',
  reportes: 'Reportes', auditoria: 'Auditoría', respaldos: 'Respaldos',
  presupuestos: 'Presupuestos', servicios: 'Servicios', activos: 'Activos fijos',
  crm: 'CRM', salud: 'Salud del sistema'
}

const spanishOps: Record<string, string> = {
  consultar: 'Consultar', crear: 'Crear', modificar: 'Modificar', eliminar: 'Eliminar',
  anular: 'Anular', aprobar: 'Aprobar', imprimir: 'Imprimir', exportar: 'Exportar',
  descuento: 'Aplicar descuentos', precio: 'Modificar precios', costo: 'Consultar costos',
  ganancia: 'Consultar ganancias', devolucion: 'Realizar devoluciones',
  abrir_caja: 'Abrir cajas', cerrar_caja: 'Cerrar cajas'
}

const resourceLabels: Record<string, string> = {
  empresa: 'Empresa', parametros: 'Parámetros', impuestos: 'Impuestos', monedas: 'Monedas',
  series: 'Series y NCF', almacenes: 'Almacenes', cajas: 'Cajas', impresoras: 'Impresoras',
  formatos: 'Formatos de impresión'
}

const extraLabels: Record<string, string> = {
  'seguridad.usuario.restablecer': 'Seguridad — Restablecer contraseña',
  'seguridad.usuario.bloquear': 'Seguridad — Bloquear usuario',
  'seguridad.permiso.modificar': 'Seguridad — Modificar permisos',
  'seguridad.sesion.consultar': 'Seguridad — Consultar sesiones',
  'configuracion.respaldo.crear': 'Respaldos — Crear copia',
  'configuracion.respaldo.restaurar': 'Respaldos — Restaurar copia',
  'presupuestos.ejecutar': 'Presupuestos — Registrar ejecución',
  'servicios.finalizar': 'Servicios — Finalizar orden',
  'activos.depreciar': 'Activos — Registrar depreciación',
  'crm.convertir': 'CRM — Convertir oportunidad en cliente'
}

export const permissionCatalog: PermissionDef[] = [
  ...modules.flatMap((module) =>
    operations
      .filter((operation) => operationModules[operation].includes(module))
      .map((operation) => ({
        key: `${module}.${operation}`,
        module,
        operation,
        label: `${spanishModules[module]} — ${spanishOps[operation]}`
      }))
  ),
  ...extraKeys.map((key) => {
    const partes = key.split('.')
    const [module, resource] = partes
    // Los permisos de acción de dos segmentos usan su propia palabra como operación.
    const operation = partes[2] ?? partes[partes.length - 1]
    const label = extraLabels[key] ??
      `Configuración — ${resourceLabels[resource] ?? resource}: ${operation === 'modificar' ? 'Modificar' : 'Consultar'}`
    return { key, module: module as ModuleKey, operation, label }
  })
]

export const permissionKeys: string[] = permissionCatalog.map((p) => p.key)

/** Roles iniciales. Los permisos se materializan en la BD durante el seed. */
export const seedRoles: { name: string; description: string; permissionFilter: (key: string) => boolean }[] = [
  {
    name: 'Administrador',
    description: 'Acceso total al sistema, incluidos seguridad y respaldos.',
    permissionFilter: () => true
  },
  {
    name: 'Gerente',
    description: 'Operación comercial y financiera, sin administración de usuarios ni restauración.',
    permissionFilter: (key) =>
      !key.startsWith('seguridad.') &&
      key !== 'configuracion.respaldo.restaurar' &&
      key !== 'configuracion.respaldo.crear' &&
      key !== 'configuracion.parametros.modificar'
  },
  {
    name: 'Vendedor',
    description: 'Ventas y consulta de maestros, sin costos, ganancias ni finanzas.',
    permissionFilter: (key) =>
      key.startsWith('dashboard.') ||
      key.startsWith('clientes.consultar') ||
      key.startsWith('productos.consultar') ||
      key.startsWith('inventario.consultar') ||
      key.startsWith('ventas.') ||
      key.startsWith('pos.') ||
      key.startsWith('cotizaciones.') ||
      key.startsWith('crm.consultar') ||
      key.startsWith('crm.crear') ||
      key.startsWith('crm.modificar') ||
      (!key.includes('.costo') && !key.includes('.ganancia') &&
        ['cxc.consultar', 'reportes.consultar'].includes(key))
  }
]
