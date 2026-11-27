/** Operaciones soportadas por el sistema de permisos. */
export const operations = [
  'consultar', 'crear', 'modificar', 'eliminar', 'anular', 'aprobar', 'imprimir', 'exportar',
  'descuento', 'precio', 'costo', 'ganancia', 'devolucion', 'abrir_caja', 'cerrar_caja'
] as const

export type Operation = (typeof operations)[number]

export const modules = [
  'dashboard', 'configuracion', 'seguridad', 'clientes', 'proveedores', 'productos', 'inventario', 'ventas',
  'pos', 'cotizaciones', 'compras', 'cxc', 'cobros', 'cxp', 'bancos', 'cajas', 'gastos', 'vendedores',
  'reportes', 'auditoria', 'respaldos',
  'presupuestos', 'servicios', 'activos', 'crm', 'salud', 'contabilidad', 'inteligencia',
  'espacio'
] as const

export type ModuleKey = (typeof modules)[number]

/** Operación → módulos a los que aplica. Evita permisos sin sentido (p. ej. ventas.abrir_caja). */
const operationModules: Record<Operation, readonly ModuleKey[]> = {
  consultar: modules,
  crear: modules.filter((m) => m !== 'dashboard'),
  modificar: modules.filter((m) => m !== 'dashboard'),
  eliminar: modules.filter((m) => m !== 'dashboard'),
  anular: ['ventas', 'compras', 'cxc', 'cobros', 'cxp', 'cotizaciones', 'cajas', 'bancos', 'gastos', 'presupuestos', 'servicios', 'contabilidad'],
  aprobar: ['cotizaciones', 'compras', 'ventas', 'gastos', 'configuracion', 'presupuestos', 'servicios', 'contabilidad'],
  imprimir: ['ventas', 'pos', 'cotizaciones', 'compras', 'cxc', 'cobros', 'cxp', 'bancos', 'cajas', 'reportes', 'presupuestos', 'servicios', 'activos', 'contabilidad', 'espacio'],
  exportar: ['clientes', 'proveedores', 'productos', 'inventario', 'ventas', 'compras', 'cxc', 'cobros', 'cxp', 'vendedores', 'reportes', 'auditoria', 'presupuestos', 'servicios', 'activos', 'crm', 'salud', 'contabilidad', 'inteligencia', 'espacio'],
  descuento: ['ventas', 'pos', 'cotizaciones'],
  precio: ['productos', 'ventas', 'pos', 'cotizaciones'],
  costo: ['productos', 'inventario', 'compras', 'reportes'],
  ganancia: ['ventas', 'productos', 'reportes'],
  devolucion: ['ventas', 'compras'],
  abrir_caja: ['cajas', 'pos'],
  cerrar_caja: ['cajas', 'pos']
}

/** Permisos que autorizan enviar el área de impresión ya preparada al motor nativo. */
export const permisosImpresion: readonly string[] = operationModules.imprimir.map(
  (modulo) => `${modulo}.imprimir`
)

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
  'seguridad.rol.eliminar',
  'configuracion.respaldo.crear',
  'configuracion.respaldo.restaurar',
  'configuracion.empresa.crear',
  'presupuestos.ejecutar',
  'servicios.finalizar',
  'activos.depreciar',
  'crm.convertir',
  'compras.descuento',
  'compras.tasa',
  'compras.almacen',
  'compras.historial',
  'espacio.mantenimiento',
  'contabilidad.asiento.confirmar',
  'contabilidad.periodo.cerrar',
  'contabilidad.integrar',
  'configuracion.ajustes.consultar',
  'configuracion.ajustes.modificar',
  'configuracion.ajustes.restaurar',
  'configuracion.ajustes.seguridad.modificar',
  'configuracion.ajustes.integraciones.modificar',
  'configuracion.ajustes.featureFlags.modificar',
  'configuracion.ajustes.interfaz.modificar',
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
  compras: 'Compras', cxc: 'Cuentas por Cobrar', cobros: 'Cobros', cxp: 'Cuentas por Pagar',
  bancos: 'Bancos', cajas: 'Cajas', gastos: 'Gastos', vendedores: 'Vendedores',
  reportes: 'Reportes', auditoria: 'Auditoría', respaldos: 'Respaldos',
  presupuestos: 'Presupuestos', servicios: 'Servicios', activos: 'Activos fijos',
  crm: 'CRM', salud: 'Salud del sistema', contabilidad: 'Contabilidad general',
  inteligencia: 'Inteligencia operativa', espacio: 'Espacio de trabajo'
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
  'seguridad.rol.eliminar': 'Seguridad — Eliminar roles personalizados',
  'seguridad.sesion.consultar': 'Seguridad — Consultar sesiones',
  'configuracion.respaldo.crear': 'Respaldos — Crear copia',
  'configuracion.respaldo.restaurar': 'Respaldos — Restaurar copia',
  'presupuestos.ejecutar': 'Presupuestos — Registrar ejecución',
  'servicios.finalizar': 'Servicios — Finalizar orden',
  'activos.depreciar': 'Activos — Registrar depreciación',
  'crm.convertir': 'CRM — Convertir oportunidad en cliente',
  'compras.descuento': 'Compras — Aplicar descuentos',
  'compras.tasa': 'Compras — Cambiar tasa de cambio',
  'compras.almacen': 'Compras — Cambiar almacén',
  'compras.historial': 'Compras — Consultar historial',
  'espacio.mantenimiento': 'Espacio de trabajo — Mantenimiento de índices',
  'contabilidad.asiento.confirmar': 'Contabilidad — Confirmar asientos',
  'contabilidad.periodo.cerrar': 'Contabilidad — Cerrar periodos',
  'contabilidad.integrar': 'Contabilidad — Integrar documentos',
  'configuracion.empresa.crear': 'Configuración — Empresa: Crear',
  'configuracion.ajustes.consultar': 'Configuración — Consultar centro de control',
  'configuracion.ajustes.modificar': 'Configuración — Modificar ajustes administrativos',
  'configuracion.ajustes.restaurar': 'Configuración — Restaurar ajustes por defecto',
  'configuracion.ajustes.seguridad.modificar': 'Configuración — Modificar ajustes de seguridad',
  'configuracion.ajustes.integraciones.modificar': 'Configuración — Modificar integraciones locales',
  'configuracion.ajustes.featureFlags.modificar': 'Configuración — Activar u ocultar módulos',
  'configuracion.ajustes.interfaz.modificar': 'Configuración — Personalizar interfaz y paneles'
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
  'seguridad.rol.eliminar': 'Permite borrar roles creados por el administrador; los roles del sistema no se pueden eliminar.',
  'seguridad.sesion.consultar': 'Permite revisar las sesiones abiertas y su actividad.',
  'configuracion.respaldo.crear': 'Permite crear copias de seguridad de la base de datos.',
  'configuracion.respaldo.restaurar': 'Permite restaurar una copia; puede sobrescribir datos recientes.',
  'presupuestos.ejecutar': 'Permite registrar gastos reales contra un presupuesto aprobado.',
  'servicios.finalizar': 'Permite cerrar una orden de servicio y dejarla lista para facturar.',
  'activos.depreciar': 'Permite registrar la depreciación mensual de activos fijos.',
  'crm.convertir': 'Permite convertir una oportunidad de CRM en cliente real.',
  'compras.descuento': 'Permite aplicar descuentos 1, 2 y 3 en las líneas del ingreso de mercancía.',
  'compras.tasa': 'Permite fijar una tasa de cambio distinta a la vigente en la configuración.',
  'compras.almacen': 'Permite elegir un almacén distinto al principal al ingresar mercancía.',
  'compras.historial': 'Permite consultar versiones, auditoría, impresiones y asientos del ingreso.',
  'espacio.mantenimiento': 'Permite reconstruir los índices SQLite; operación auditada y reindexa toda la base de datos.',
  'contabilidad.asiento.confirmar': 'Permite confirmar asientos contables para que alimenten libros y balances.',
  'contabilidad.periodo.cerrar': 'Permite cerrar un periodo contable; impide registrar en él.',
  'contabilidad.integrar': 'Permite generar asientos reales desde documentos pendientes.',
  'configuracion.ajustes.consultar': 'Permite leer las preferencias operativas del centro de control de la empresa.',
  'configuracion.ajustes.modificar': 'Permite cambiar alertas, flujos, paneles, tema y fiscalidad desde el centro de control.',
  'configuracion.ajustes.restaurar': 'Permite devolver un grupo de ajustes a los valores por defecto validados.',
  'configuracion.ajustes.seguridad.modificar': 'Permite cambiar refuerzos visuales de seguridad; nunca las políticas duras del backend.',
  'configuracion.ajustes.integraciones.modificar': 'Permite configurar carpetas y formatos de exportación local.',
  'configuracion.ajustes.featureFlags.modificar': 'Permite ocultar módulos opcionales; los módulos protegidos siguen visibles.',
  'configuracion.ajustes.interfaz.modificar': 'Permite renombrar y reordenar módulos, cambiar el ancho del menú y ocultar elementos visuales.'
}

const criticalPermissionKeys = new Set([
  'seguridad.usuario.restablecer',
  'seguridad.usuario.bloquear',
  'seguridad.permiso.modificar',
  'seguridad.sesion.consultar',
  'seguridad.rol.eliminar',
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
  'configuracion.ajustes.featureFlags.modificar',
  'configuracion.ajustes.interfaz.modificar',
  'espacio.mantenimiento'
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
/** Permisos mínimos para los perfiles operativos semilla. No incluyen Panel comercial. */
const permisosFacturador = new Set([
  'ventas.consultar', 'ventas.crear', 'ventas.imprimir', 'ventas.exportar',
  'clientes.consultar', 'productos.consultar', 'inventario.consultar'
])

const permisosCobrador = new Set([
  'cobros.consultar', 'cobros.crear', 'cobros.anular', 'cobros.imprimir', 'cobros.exportar'
])

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
      key !== 'espacio.mantenimiento' &&
      !(key.startsWith('configuracion.ajustes.') && key !== 'configuracion.ajustes.consultar') &&
      key !== 'contabilidad.periodo.cerrar' &&
      key !== 'contabilidad.integrar'
  },
  {
    name: 'Vendedor',
    description: 'Ventas y consulta de maestros, sin costos, ganancias ni finanzas.',
    // Ventas no cobra: el perfil de Vendedor nunca recibe permisos de Cobros.
    permissionFilter: (key) =>
      !key.startsWith('cobros.') &&
      (key.startsWith('dashboard.') ||
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
        ['cxc.consultar', 'reportes.consultar'].includes(key)))
  },
  {
    name: 'Facturador',
    description: 'Crea facturas y gestiona borradores locales; no cobra ni administra finanzas.',
    // Sin `reportes.consultar`: el panel comercial unificado queda oculto para este perfil.
    permissionFilter: (key) => permisosFacturador.has(key)
  },
  {
    name: 'Cobrador',
    description: 'Registra recibos, anticipos y anulaciones de cobro; no emite facturas.',
    // Sin `reportes.consultar` ni `ventas.consultar`: solo ve el área de Cobros.
    permissionFilter: (key) => permisosCobrador.has(key)
  }
]

/** Plantillas listas para crear roles desde la UI, sin permisos críticos. */
export interface RoleTemplate {
  id: string
  nombre: string
  descripcion: string
  permisos: string[]
}

const esCritico = new Set(criticalPermissionKeys)

function plantilla(id: string, nombre: string, descripcion: string, aceptar: (key: string) => boolean): RoleTemplate {
  return {
    id, nombre, descripcion,
    permisos: permissionKeys.filter((key) => !esCritico.has(key) && aceptar(key))
  }
}

export const roleTemplates: RoleTemplate[] = [
  plantilla(
    'ventas', 'Solo Ventas',
    'Factura, cotiza y usa el POS; no puede cobrar ni administrar finanzas.',
    (key) => key.startsWith('ventas.') || key.startsWith('pos.') || key.startsWith('cotizaciones.') ||
      ['dashboard.consultar', 'clientes.consultar', 'productos.consultar', 'inventario.consultar'].includes(key)
  ),
  plantilla(
    'cobros', 'Solo Cobros',
    'Registra recibos, anticipos y anulaciones de cobro; no emite facturas.',
    (key) => key.startsWith('cobros.') || ['clientes.consultar', 'cxc.consultar', 'reportes.consultar'].includes(key)
  ),
  plantilla(
    'consulta', 'Solo Consulta',
    'Lectura general, sin altas, cambios ni acceso al área de cobros.',
    (key) => key.endsWith('.consultar') && !key.startsWith('cobros.')
  ),
  plantilla(
    'personal', 'Personalización',
    'Configura tema, paneles y módulos visibles sin tocar seguridad ni finanzas.',
    (key) => key.startsWith('configuracion.ajustes.') || key === 'dashboard.consultar'
  )
]
