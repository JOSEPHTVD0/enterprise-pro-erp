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
  'presupuestos', 'servicios', 'activos', 'crm', 'salud', 'contabilidad', 'inteligencia'
] as const

export type ModuleKey = (typeof modules)[number]

/** Operación → módulos a los que aplica. Evita permisos sin sentido (p. ej. ventas.abrir_caja). */
const operationModules: Record<Operation, readonly ModuleKey[]> = {
  consultar: modules,
  crear: modules.filter((m) => m !== 'dashboard'),
  modificar: modules.filter((m) => m !== 'dashboard'),
  eliminar: modules.filter((m) => m !== 'dashboard'),
  anular: ['ventas', 'compras', 'cxc', 'cxp', 'cotizaciones', 'cajas', 'bancos', 'gastos', 'presupuestos', 'servicios', 'contabilidad'],
  aprobar: ['cotizaciones', 'compras', 'ventas', 'gastos', 'configuracion', 'presupuestos', 'servicios', 'contabilidad'],
  imprimir: ['ventas', 'pos', 'cotizaciones', 'compras', 'cxc', 'cxp', 'bancos', 'cajas', 'reportes', 'presupuestos', 'servicios', 'activos', 'contabilidad'],
  exportar: ['clientes', 'proveedores', 'productos', 'inventario', 'ventas', 'compras', 'cxc', 'cxp', 'vendedores', 'reportes', 'auditoria', 'presupuestos', 'servicios', 'activos', 'crm', 'salud', 'contabilidad', 'inteligencia'],
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
  'contabilidad.asiento.confirmar',
  'contabilidad.periodo.cerrar',
  'contabilidad.integrar',
  'configuracion.ajustes.consultar',
  'configuracion.ajustes.modificar',
  'configuracion.ajustes.restaurar',
  'configuracion.ajustes.seguridad.modificar',
  'configuracion.ajustes.integraciones.modificar',
  'configuracion.ajustes.featureFlags.modificar',
  ...configResourceKeys
] as const

export interface PermissionDef {
  key: string
  module: ModuleKey
  operation: string
  label: string
  /** Explicación visible en el editor de permisos: para qué sirve en la operación diaria. */
  descripcion: string
  /** Permiso sensible: requiere confirmación adicional al concederlo en roles personalizados. */
  critico: boolean
  /** Creado por un administrador para esta empresa. No sustituye a los permisos del sistema. */
  personalizado?: boolean
}

/** Prefijo reservado para permisos creados por el administrador. */
export const customPermissionPrefix = 'custom.'
export const customPermissionKeyPattern = /^custom\.[a-z0-9_]{3,40}$/

const spanishModules: Record<ModuleKey, string> = {
  dashboard: 'Panel', configuracion: 'Configuración', seguridad: 'Seguridad',
  clientes: 'Clientes', proveedores: 'Proveedores', productos: 'Productos', inventario: 'Inventario',
  ventas: 'Ventas', pos: 'Punto de Venta', cotizaciones: 'Cotizaciones',
  compras: 'Compras', cxc: 'Cuentas por Cobrar', cxp: 'Cuentas por Pagar',
  bancos: 'Bancos', cajas: 'Cajas', gastos: 'Gastos', vendedores: 'Vendedores',
  reportes: 'Reportes', auditoria: 'Auditoría', respaldos: 'Respaldos',
  presupuestos: 'Presupuestos', servicios: 'Servicios', activos: 'Activos fijos',
  crm: 'CRM', salud: 'Salud del sistema', contabilidad: 'Contabilidad general',
  inteligencia: 'Inteligencia operativa'
}

/** Etiquetas legibles de módulo para el editor de permisos. */
export const moduleLabels: Record<ModuleKey, string> = spanishModules

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
  'crm.convertir': 'CRM — Convertir oportunidad en cliente',
  'contabilidad.asiento.confirmar': 'Contabilidad — Confirmar asientos',
  'contabilidad.periodo.cerrar': 'Contabilidad — Cerrar periodos',
  'contabilidad.integrar': 'Contabilidad — Integrar documentos',
  'configuracion.empresa.crear': 'Configuración — Empresa: Crear',
  'configuracion.ajustes.consultar': 'Configuración — Consultar centro de control',
  'configuracion.ajustes.modificar': 'Configuración — Modificar ajustes administrativos',
  'configuracion.ajustes.restaurar': 'Configuración — Restaurar ajustes por defecto',
  'configuracion.ajustes.seguridad.modificar': 'Configuración — Modificar ajustes de seguridad',
  'configuracion.ajustes.integraciones.modificar': 'Configuración — Modificar integraciones locales',
  'configuracion.ajustes.featureFlags.modificar': 'Configuración — Activar u ocultar módulos'
}

const operationDescriptions: Record<Operation, string> = {
  consultar: 'Permite ver y filtrar la información',
  crear: 'Permite registrar nuevos datos',
  modificar: 'Permite editar datos existentes',
  eliminar: 'Permite dar de baja o eliminar registros',
  anular: 'Permite anular documentos y revertir su efecto',
  aprobar: 'Permite aprobar operaciones pendientes',
  imprimir: 'Permite generar impresiones y archivos PDF',
  exportar: 'Permite exportar información a Excel o CSV',
  descuento: 'Permite aplicar descuentos autorizados',
  precio: 'Permite modificar precios de venta',
  costo: 'Permite consultar costos internos',
  ganancia: 'Permite consultar utilidades y márgenes',
  devolucion: 'Permite registrar devoluciones',
  abrir_caja: 'Permite abrir cajas e iniciar turnos',
  cerrar_caja: 'Permite cerrar cajas y cuadrar turnos'
}

const extraDescriptions: Record<string, string> = {
  'seguridad.usuario.restablecer': 'Permite generar una contraseña temporal para otro usuario.',
  'seguridad.usuario.bloquear': 'Permite bloquear o desbloquear el acceso de un usuario.',
  'seguridad.permiso.modificar': 'Permite cambiar roles, permisos y accesos desde el centro de control.',
  'seguridad.sesion.consultar': 'Permite revisar las sesiones abiertas y su actividad.',
  'configuracion.respaldo.crear': 'Permite crear copias de seguridad de la base de datos.',
  'configuracion.respaldo.restaurar': 'Permite restaurar una copia; puede sobrescribir datos recientes.',
  'presupuestos.ejecutar': 'Permite registrar gastos reales contra un presupuesto aprobado.',
  'servicios.finalizar': 'Permite cerrar una orden de servicio y dejarla lista para facturar.',
  'activos.depreciar': 'Permite registrar la depreciación mensual de activos fijos.',
  'crm.convertir': 'Permite convertir una oportunidad de CRM en cliente real.',
  'contabilidad.asiento.confirmar': 'Permite confirmar asientos contables para que alimenten libros y balances.',
  'contabilidad.periodo.cerrar': 'Permite cerrar un periodo contable; impide registrar en él.',
  'contabilidad.integrar': 'Permite generar asientos reales desde documentos pendientes.',
  'configuracion.ajustes.consultar': 'Permite leer las preferencias operativas del centro de control de la empresa.',
  'configuracion.ajustes.modificar': 'Permite cambiar alertas, flujos, paneles, tema y fiscalidad desde el centro de control.',
  'configuracion.ajustes.restaurar': 'Permite devolver un grupo de ajustes a los valores por defecto validados.',
  'configuracion.ajustes.seguridad.modificar': 'Permite cambiar refuerzos visuales de seguridad; nunca las políticas duras del backend.',
  'configuracion.ajustes.integraciones.modificar': 'Permite configurar carpetas y formatos de exportación local.',
  'configuracion.ajustes.featureFlags.modificar': 'Permite ocultar módulos opcionales; los módulos protegidos siguen visibles.'
}

const criticalPermissionKeys = new Set([
  'seguridad.usuario.restablecer',
  'seguridad.usuario.bloquear',
  'seguridad.permiso.modificar',
  'seguridad.sesion.consultar',
  'configuracion.parametros.modificar',
  'configuracion.respaldo.crear',
  'configuracion.respaldo.restaurar',
  'configuracion.empresa.crear',
  'auditoria.consultar',
  'contabilidad.periodo.cerrar',
  'contabilidad.integrar',
  'configuracion.ajustes.modificar',
  'configuracion.ajustes.restaurar',
  'configuracion.ajustes.seguridad.modificar',
  'configuracion.ajustes.integraciones.modificar',
  'configuracion.ajustes.featureFlags.modificar'
])

export const permissionCriticalKeys: string[] = [...criticalPermissionKeys]

export const permissionCatalog: PermissionDef[] = [
  ...modules.flatMap((module) =>
    operations
      .filter((operation) => operationModules[operation].includes(module))
      .map((operation) => ({
        key: `${module}.${operation}`,
        module,
        operation,
        label: `${spanishModules[module]} — ${spanishOps[operation]}`,
        descripcion: `${operationDescriptions[operation]} de ${spanishModules[module].toLowerCase()}.`,
        critico: criticalPermissionKeys.has(`${module}.${operation}`)
      }))
  ),
  ...extraKeys.map((key) => {
    const partes = key.split('.')
    const [module, resource] = partes
    // Los permisos de acción de dos segmentos usan su propia palabra como operación.
    const operation = partes[2] ?? partes[partes.length - 1]
    const label = extraLabels[key] ??
      `Configuración — ${resourceLabels[resource] ?? resource}: ${operation === 'modificar' ? 'Modificar' : 'Consultar'}`
    const descripcion = extraDescriptions[key] ??
      `Permite ${operation === 'modificar' ? 'editar' : 'consultar'} la configuración de ${resourceLabels[resource] ?? resource} de la empresa.`
    return { key, module: module as ModuleKey, operation, label, descripcion, critico: criticalPermissionKeys.has(key) }
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
      key !== 'configuracion.parametros.modificar' &&
      !(key.startsWith('configuracion.ajustes.') && key !== 'configuracion.ajustes.consultar') &&
      key !== 'contabilidad.periodo.cerrar' &&
      key !== 'contabilidad.integrar'
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
