import { z } from 'zod'
import { modules } from '../permissions'
import { conDefaultsDeObjetoVacio } from './defaults'

/**
 * Ajustes administrativos por empresa. Se persisten en SQLite (tabla `ajustes`)
 * y se validan otra vez en backend antes de escribirse. Ninguna de estas claves
 * puede relajar las políticas duras de sesión, IPC, transacciones o permisos.
 */

const entero = (min: number, max: number): z.ZodNumber => z.number().int().min(min).max(max)
const unique = (valores: string[], nombre: string, ctx: z.RefinementCtx): void => {
  const vistos = new Set<string>()
  for (const valor of valores) {
    if (vistos.has(valor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [nombre],
        message: `No se puede repetir ${valor}.`
      })
    }
    vistos.add(valor)
  }
}

export const ajustesGrupos = [
  'alertas', 'flujos', 'widgets', 'rendimiento', 'integraciones',
  'tema', 'fiscal', 'notificaciones', 'seguridad', 'featureFlags', 'interfaz', 'panel2026',
  'dgiEnlace'
] as const

export type AjustesGrupo = (typeof ajustesGrupos)[number]
export const ajustesGrupoEnum = z.enum(ajustesGrupos as unknown as [AjustesGrupo, ...AjustesGrupo[]])

/**
 * Grupos que cualquier usuario autenticado puede leer para recibir su interfaz
 * efectiva. Siguen fuera `seguridad`, `integraciones`, `rendimiento` y `fiscal`:
 * sus valores se aplican en el backend o se exponen solo como derivados seguros.
 */
export const ajustesGruposVisuales = [
  'tema', 'widgets', 'featureFlags', 'interfaz', 'alertas', 'notificaciones', 'panel2026', 'dgiEnlace'
] as const

export const widgetIds = [
  'kpi-ventas', 'kpi-compras', 'kpi-utilidad', 'kpi-margen', 'kpi-cobros', 'kpi-pagos',
  'kpi-cxc', 'kpi-cxp', 'tendencia', 'formas-pago', 'top-clientes', 'top-productos', 'alertas'
] as const
export type WidgetId = (typeof widgetIds)[number]
const widgetIdSchema = z.enum(widgetIds as unknown as [WidgetId, ...WidgetId[]])

const moduloFlagSchema = z.object({
  modulo: z.enum(modules as unknown as [(typeof modules)[number], ...(typeof modules)[number][]]),
  activo: z.boolean()
})

/** Estos módulos nunca se ocultan: son necesarios para recuperar el sistema. */
export const modulosProtegidos = ['dashboard', 'configuracion', 'seguridad', 'respaldos'] as const

export const alertasSchema = conDefaultsDeObjetoVacio(z.object({
  stockBajoUmbral: entero(0, 100000).default(5),
  seriesRestantes: entero(0, 1000).default(20),
  cxcDiasVencimiento: entero(1, 365).default(15),
  presupuestoPct: entero(1, 100).default(80),
  nivelMinimo: z.enum(['INFO', 'MEDIO', 'ALTO']).default('INFO'),
  destinos: z.array(z.enum(['PANEL', 'TOAST'])).min(1).default(['PANEL', 'TOAST'])
}).superRefine((valor, ctx) => unique(valor.destinos, 'destinos', ctx)))

export const flujosSchema = conDefaultsDeObjetoVacio(z.object({
  ventasRequierenAprobacion: z.boolean().default(false),
  comprasRequierenAprobacion: z.boolean().default(false),
  anulacionRequiereMotivo: z.boolean().default(true),
  autoAprobarHastaCent: entero(0, 100000000).default(0),
  estadosOrden: z.array(z.enum(['RECIBIDA', 'EN_PROCESO', 'PENDIENTE_CLIENTE', 'FINALIZADA']))
    .min(1).default(['RECIBIDA', 'EN_PROCESO', 'PENDIENTE_CLIENTE', 'FINALIZADA']),
  cierreCajaAutomatico: z.boolean().default(false)
}).superRefine((valor, ctx) => {
  unique(valor.estadosOrden, 'estadosOrden', ctx)
  // El umbral en centavos permite despachar importes pequeños sin aprobación
  // explícita; 0 significa que siempre se exige el permiso correspondiente.
}))

const widgetSchema = z.object({
  id: widgetIdSchema,
  visible: z.boolean().default(true),
  orden: entero(0, 99),
  ancho: z.enum(['TERCIO', 'MEDIO', 'COMPLETO']).default('MEDIO')
})

const widgetsPorDefecto: z.infer<typeof widgetSchema>[] = widgetIds.map((id, i) => ({
  id, visible: true, orden: i, ancho: id.startsWith('kpi-') ? 'TERCIO' : 'MEDIO'
}))

export const widgetsSchema = conDefaultsDeObjetoVacio(z.object({
  widgets: z.array(widgetSchema).default(widgetsPorDefecto),
  densidad: z.enum(['compacta', 'normal']).default('normal'),
  intervaloActualizacionSeg: entero(30, 3600).default(60),
  filas: entero(3, 50).default(8),
  buscadorGlobal: z.boolean().default(true),
  filtrosAvanzados: z.boolean().default(true),
  columnasConfigurables: z.boolean().default(true),
  exportarCsv: z.boolean().default(true),
  confirmarEliminacion: z.boolean().default(true),
  tamanoPagina: entero(5, 100).default(10)
}).superRefine((valor, ctx) => unique(valor.widgets.map((w) => w.id), 'widgets', ctx)))

export const rendimientoSchema = conDefaultsDeObjetoVacio(z.object({
  limiteFilas: entero(10, 500).default(100),
  cacheSegundos: entero(0, 3600).default(30),
  vacuumProgramado: z.enum(['DESACTIVADO', 'SEMANAL', 'MENSUAL']).default('MENSUAL'),
  modoBajoConsumo: z.boolean().default(false),
  lazyCargaModulos: z.boolean().default(true)
}))

/** Panel 2026: preferencias operativas aplicadas por los servicios de solo lectura. */
export const panel2026Schema = conDefaultsDeObjetoVacio(z.object({
  vista: z.enum(['OPERATIVA', 'FINANCIERA', 'RIESGO']).default('OPERATIVA'),
  metricaPrincipal: z.enum(['VENTAS', 'COBROS', 'CXC', 'STOCK']).default('VENTAS'),
  diasProyeccion: entero(7, 90).default(28),
  umbralCxcDias: entero(1, 365).default(15),
  umbralStockBajo: entero(0, 100000).default(5),
  filas: entero(3, 50).default(10),
  compararPeriodo: z.boolean().default(true),
  mostrarAlertas: z.boolean().default(true)
}))

export const integracionesSchema = conDefaultsDeObjetoVacio(z.object({
  carpetaExportacion: z.string().trim().min(1).max(80)
    .regex(/^[A-Za-z0-9_-]+$/, 'Solo se permite un nombre de carpeta relativo, sin rutas absolutas.')
    .default('exportaciones'),
  formatos: z.array(z.enum(['CSV', 'XLSX', 'PDF'])).min(1).default(['CSV', 'PDF']),
  impresoraTicket: z.string().trim().max(120).default(''),
  exportacionAutomatica: z.boolean().default(false)
}).superRefine((valor, ctx) => unique(valor.formatos, 'formatos', ctx)))

export const temaSchema = conDefaultsDeObjetoVacio(z.object({
  escala: z.number().min(0.8).max(1.3).default(1),
  radio: z.enum(['NINGUNO', 'SUAVE', 'REDONDO']).default('SUAVE'),
  fuente: z.enum(['SISTEMA', 'SANS', 'SERIF']).default('SISTEMA'),
  colorAcento: z.enum(['INDIGO', 'VERDE', 'AZUL', 'AMBAR']).default('INDIGO'),
  reducirMovimiento: z.boolean().default(false),
  altoContraste: z.boolean().default(false)
}))

export const fiscalAvanzadoSchema = conDefaultsDeObjetoVacio(z.object({
  itbisPorDefecto: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/).default('ITBIS18'),
  monedaBase: z.enum(['DOP', 'USD', 'EUR']).default('DOP'),
  // El redondeo bancario es la única política soportada; no se expone como variable libre.
  redondeo: z.literal('BANCARIO').default('BANCARIO'),
  ncfAvisoDias: entero(1, 90).default(15),
  libro606: z.boolean().default(true),
  libro607: z.boolean().default(true),
  formatoComprobante: z.enum(['NCF', 'PREPARACION_E_CF']).default('NCF')
}))

/**
 * Enlace DGI meramente visual. No hay envío, certificación, exportación ni
 * consumo de endpoints; estos valores solo rotulan el panel de facturación.
 */
export const dgiEnlaceVisualSchema = conDefaultsDeObjetoVacio(z.object({
  mostrarPanel: z.boolean().default(true),
  estadoVisual: z.enum(['SIN_ENLACE', 'EN_PREPARACION', 'INACTIVO']).default('SIN_ENLACE'),
  ambienteVisual: z.enum(['NO_APLICA', 'PRUEBAS', 'PRODUCCION']).default('NO_APLICA'),
  notaInformativa: z.string().trim().min(1).max(120)
    .default('Solo visual: sin envío a DGII ni emisión e-CF.')
}))

const eventosNotificacion = [
  'VENTA', 'COMPRA', 'STOCK_BAJO', 'CXC_VENCIDO', 'SERIE_ALERTA', 'BACKUP', 'ACTUALIZACION'
] as const

export const notificacionesSchema = conDefaultsDeObjetoVacio(z.object({
  sonido: z.boolean().default(false),
  duracionToastMs: entero(1000, 10000).default(4000),
  eventos: z.array(z.enum(eventosNotificacion)).default(['STOCK_BAJO', 'CXC_VENCIDO', 'SERIE_ALERTA'])
}).superRefine((valor, ctx) => unique(valor.eventos, 'eventos', ctx)))

export const seguridadAvanzadaSchema = conDefaultsDeObjetoVacio(z.object({
  ocultarCostosEnListados: z.boolean().default(false),
  confirmarAnulaciones: z.boolean().default(true),
  mascararRnc: z.boolean().default(false),
  avisoAntesDeBloqueoMin: entero(1, 30).default(5)
}))

export const featureFlagsSchema = conDefaultsDeObjetoVacio(z.object({
  modulos: z.array(moduloFlagSchema).default(modules.map((modulo) => ({ modulo, activo: true })))
}).superRefine((valor, ctx) => {
  unique(valor.modulos.map((m) => m.modulo), 'modulos', ctx)
  const protegidos = new Set<string>(modulosProtegidos)
  valor.modulos.forEach((m, i) => {
    if (protegidos.has(m.modulo) && !m.activo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modulos', i, 'activo'],
        message: `${m.modulo} es un módulo protegido y no se puede ocultar.`
      })
    }
  })
}))

/** Identificadores estables de los grupos del menú; el renderer los usa para reordenar. */
export const gruposMenu = [
  'principal', 'ventas', 'cobros', 'compras', 'inventario', 'maestros',
  'finanzas', 'analisis', 'planificacion', 'admin'
] as const

export const elementosOcultables = [
  'buscadorModulos', 'barraEstado', 'distintivoFase', 'avatarUsuario', 'botonTema',
  'botonActualizaciones', 'botonAcerca'
] as const

/** Vistas del menú que se pueden renombrar sin alterar permisos ni rutas. */
export const vistasPersonalizables = [
  'dashboard', 'apariencia', 'dashboard-ejecutivo', 'centro-control', 'inteligencia', 'agenda',
  'facturacion', 'pos', 'cotizaciones', 'cobros', 'compras', 'productos', 'inventario', 'control-stock',
  'clientes', 'proveedores', 'vendedores', 'catalogos', 'cxc', 'cxp', 'bancos', 'cajas',
  'gastos', 'contabilidad', 'reportes', 'presupuestos', 'servicios', 'activos', 'crm',
  'usuarios', 'roles', 'configuracion', 'configuracion-avanzada', 'salud', 'auditoria', 'respaldos',
  'espacio-trabajo'
] as const

export const interfazSchema = conDefaultsDeObjetoVacio(z.object({
  tituloApp: z.string().trim().min(2).max(40).default('ENTERPRISE PRO'),
  anchoSidebar: entero(200, 360).default(240),
  densidadTablas: z.enum(['compacta', 'normal']).default('normal'),
  mostrarIconos: z.boolean().default(true),
  ordenGrupos: z.array(z.enum(gruposMenu)).default([...gruposMenu]),
  etiquetasModulo: z.record(z.string(), z.string().trim().min(1).max(60)).default({}),
  ocultarElementos: z.array(z.enum(elementosOcultables)).default([]),
  piePersonalizado: z.string().trim().max(120).default('')
}).superRefine((valor, ctx) => {
  unique(valor.ordenGrupos, 'ordenGrupos', ctx)
  unique(valor.ocultarElementos, 'ocultarElementos', ctx)
  const conocidos = new Set<string>([...vistasPersonalizables, ...gruposMenu])
  for (const [modulo, etiqueta] of Object.entries(valor.etiquetasModulo)) {
    if (!conocidos.has(modulo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['etiquetasModulo', modulo],
        message: `${modulo} no es un módulo conocido.`
      })
    }
    if (etiqueta.length > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['etiquetasModulo', modulo],
        message: 'La etiqueta no puede superar 60 caracteres.'
      })
    }
  }
}))

export const ajustesPorGrupo = {
  alertas: alertasSchema,
  flujos: flujosSchema,
  widgets: widgetsSchema,
  rendimiento: rendimientoSchema,
  integraciones: integracionesSchema,
  tema: temaSchema,
  fiscal: fiscalAvanzadoSchema,
  notificaciones: notificacionesSchema,
  seguridad: seguridadAvanzadaSchema,
  featureFlags: featureFlagsSchema,
  interfaz: interfazSchema,
  panel2026: panel2026Schema,
  dgiEnlace: dgiEnlaceVisualSchema
} as const

export type Ajustes = { [K in AjustesGrupo]: z.infer<(typeof ajustesPorGrupo)[K]> }

/** Defaults derivados de Zod: la BD solo guarda excepciones, nunca una copia duplicada. */
export const defaultAjustes: Ajustes = {
  alertas: alertasSchema.parse({}),
  flujos: flujosSchema.parse({}),
  widgets: widgetsSchema.parse({}),
  rendimiento: rendimientoSchema.parse({}),
  integraciones: integracionesSchema.parse({}),
  tema: temaSchema.parse({}),
  fiscal: fiscalAvanzadoSchema.parse({}),
  notificaciones: notificacionesSchema.parse({}),
  seguridad: seguridadAvanzadaSchema.parse({}),
  featureFlags: featureFlagsSchema.parse({}),
  interfaz: interfazSchema.parse({}),
  panel2026: panel2026Schema.parse({}),
  dgiEnlace: dgiEnlaceVisualSchema.parse({})
}

export const ajustesGetSchema = z.object({ grupo: ajustesGrupoEnum.optional() }).default({})
export const ajustesResetSchema = z.object({ grupo: ajustesGrupoEnum })

export const ajustesSaveSchema = z.discriminatedUnion('grupo', [
  z.object({ grupo: z.literal('alertas'), datos: alertasSchema }),
  z.object({ grupo: z.literal('flujos'), datos: flujosSchema }),
  z.object({ grupo: z.literal('widgets'), datos: widgetsSchema }),
  z.object({ grupo: z.literal('rendimiento'), datos: rendimientoSchema }),
  z.object({ grupo: z.literal('integraciones'), datos: integracionesSchema }),
  z.object({ grupo: z.literal('tema'), datos: temaSchema }),
  z.object({ grupo: z.literal('fiscal'), datos: fiscalAvanzadoSchema }),
  z.object({ grupo: z.literal('notificaciones'), datos: notificacionesSchema }),
  z.object({ grupo: z.literal('seguridad'), datos: seguridadAvanzadaSchema }),
  z.object({ grupo: z.literal('featureFlags'), datos: featureFlagsSchema }),
  z.object({ grupo: z.literal('interfaz'), datos: interfazSchema }),
  z.object({ grupo: z.literal('panel2026'), datos: panel2026Schema }),
  z.object({ grupo: z.literal('dgiEnlace'), datos: dgiEnlaceVisualSchema })
])

export type AjustesSave = z.infer<typeof ajustesSaveSchema>
export type AjustesGet = Partial<Ajustes>
