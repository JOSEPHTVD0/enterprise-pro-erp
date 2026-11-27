import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ZodType } from 'zod'
import { z } from 'zod'
import { join } from 'node:path'
import { closeDatabase, type Db } from '../db/connection'
import { buildContext, contextoPublico, type SessionContext } from '../services/context'
import { createAuthService } from '../services/auth.service'
import { createSeguridadService } from '../services/seguridad.service'
import { createConfiguracionService } from '../services/configuracion.service'
import { createDashboardService } from '../services/dashboard.service'
import { createMaestrosService } from '../services/maestros.service'
import { createBusquedaService } from '../services/busqueda.service'
import { createInventarioService } from '../services/inventario.service'
import { createVentasService } from '../services/ventas.service'
import { createPosService } from '../services/pos.service'
import { createComprasService } from '../services/compras.service'
import { createFinanzasService } from '../services/finanzas.service'
import { createCobrosService } from '../services/cobros.service'
import { createReportesService } from '../services/reportes.service'
import { createBackupsService } from '../services/backups.service'
import { generarPdf } from '../services/pdf.service'
import { createDashboardEjecutivoService } from '../services/dashboard-ejecutivo.service'
import { createPanel2026Service } from '../services/panel2026.service'
import { createPanelPreferenciasService } from '../services/panel-preferencias.service'
import { loadSettings } from '../settings'
import { createSaludService } from '../services/salud.service'
import { createModulos2026Service } from '../services/modulos2026.service'
import { createContabilidadService } from '../services/contabilidad.service'
import { createAjustesService } from '../services/ajustes.service'
import { createInteligenciaService } from '../services/inteligencia.service'
import { createEspacioService } from '../services/espacio.service'
import { createImpresionService } from '../services/impresion.service'
import { serializeError, errors, encodeIpcError } from '@shared/errors'
import { permisosImpresion } from '@shared/permissions'
import { assertCanProceed } from './policy'
import {
  loginSchema, changePasswordSchema, createUserSchema, updateUserSchema,
  createRoleSchema, rolePermissionsReplaceSchema, deleteRoleSchema,
  customPermissionCreateSchema, customPermissionDeleteSchema
} from '@shared/schemas/auth'
import {
  empresaSchema, parametroSchema, backupConfigSchema,
  impuestoSchema, monedaSchema, serieSchema, almacenSchema, cajaSchema, impresoraSchema,
  tasaCambioSchema, formatoSchema
} from '@shared/schemas/config'
import { maestroEntidadSchema, type MaestroEntidad } from '@shared/maestros'
import {
  movimientoSchema, ajusteSchema, transferenciaSchema,
  existenciasFiltroSchema, kardexFiltroSchema, anularSchema,
  serieProductoSchema, loteProductoSchema, exportarInventarioSchema
} from '@shared/schemas/inventario'
import {
  documentoVentaSchema, cotizacionCarritoSchema, posVentaSchema,
  suspenderVentaSchema, anularDocumentoSchema, convertirDocumentoSchema,
  conduceSchema, entregaSchema, documentosFiltroSchema, exportarVentasSchema,
  imprimirDocumentoSchema, abrirCajaSchema, cerrarCajaSchema
} from '@shared/schemas/ventas'
import {
  documentoCompraSchema, recepcionSchema, convertirCompraSchema,
  anularCompraSchema, documentosFiltroCompraSchema, exportarComprasSchema,
  imprimirCompraSchema, tiposDocumentoCompra,
  ingresoMercanciaSchema, editarIngresoSchema, historialIngresoSchema
} from '@shared/schemas/compras'
import {
  finanzasFiltroSchema, movimientosBancoFiltroSchema, sesionesCajaFiltroSchema,
  anularFinanzasSchema, referenciaFinanzasSchema, imprimirFinanzasSchema, exportarFinanzasSchema,
  cxcReciboCrearSchema, cxpPagoCrearSchema, anticipoCrearSchema,
  bancoCuentaSchema, bancoMovimientoSchema, bancoConciliacionSchema,
  abrirCajaFinanzasSchema, cerrarCajaFinanzasSchema, movimientoCajaManualSchema,
  gastoCategoriaSchema, gastoCrearSchema, gastoPagarSchema, gastoRecurrenteSchema,
  comisionCrearSchema, comisionPagarSchema
} from '@shared/schemas/finanzas'
import {
  reportesSerieSchema, reportesConsultaSchema, reportesExportarSchema, reportesImprimirSchema
} from '@shared/schemas/reportes'
import {
  respaldosCrearSchema, respaldosHistorialSchema, respaldosIntegridadSchema, respaldosRestaurarSchema
} from '@shared/schemas/respaldos'
import { pdfGenerarSchema } from '@shared/schemas/pdf'
import { impresionEjecutarSchema } from '@shared/schemas/impresion'
import {
  espacioFiltroSchema, espacioComprobantesFiltroSchema, espacioComprobanteEmitirSchema,
  espacioPresetSchema, espacioPresetIdSchema, espacioReindexSchema,
  type EspacioComprobanteEmitir
} from '@shared/schemas/espacio'
import {
  ajustesGetSchema, ajustesResetSchema, ajustesSaveSchema
} from '@shared/schemas/ajustes'
import {
  ajustesPersonalizadosGetSchema, ajustesPersonalizadoSaveSchema, ajustesPersonalizadoDeleteSchema
} from '@shared/schemas/personalizacion'
import {
  dashboardEjecutivoSchema, inteligenciaFiltroSchema, panel2026FiltroSchema
} from '@shared/schemas/paneles'
import { busquedaGlobalSchema, type BusquedaGlobalInput } from '@shared/schemas/busqueda'
import {
  idModuloSchema, filtroModulosSchema, cambiarEstadoSchema, presupuestoCrearSchema,
  presupuestoEjecutarSchema, servicioCatalogoSchema, ordenServicioCrearSchema,
  activoCrearSchema, activoDepreciarSchema, leadCrearSchema, leadEstadoSchema,
  seguimientoCrearSchema, leadConvertirSchema
} from '@shared/schemas/modulos2026'
import {
  filtroContabilidadSchema, cuentaCrearSchema, cuentaModificarSchema, cuentaEstadoSchema,
  periodoAbrirSchema, periodoCerrarSchema, asientoCrearSchema, asientoEstadoSchema,
  mayorSchema, integrarSchema
} from '@shared/schemas/contabilidad'
import {
  panelHorizontalFiltroSchema, panelHorizontalIds,
  type PanelHorizontalId, type PanelHorizontalRespuesta
} from '@shared/schemas/panel-horizontal'

interface Route {
  /** Permiso requerido en el backend. Si se omite, el service verifica uno más específico. */
  permission?: string
  /** Alternativas válidas: basta con que la sesión tenga una de ellas. */
  anyPermission?: readonly string[]
  schema?: ZodType
  auth: boolean
  handle: (ctx: SessionContext, input: never) => unknown
}

export interface Envelope {
  token?: string
  input?: unknown
}

const zId = z.number().int().positive()
const string = z.string()

/** Catálogos permitidos. El renderer no puede elegir tablas arbitrarias. */
const catalogSchemas = {
  impuestos: impuestoSchema,
  monedas: monedaSchema,
  series_documento: serieSchema,
  almacenes: almacenSchema,
  cajas: cajaSchema,
  impresoras: impresoraSchema
} as const

type CatalogName = keyof typeof catalogSchemas

const catalogNames = Object.keys(catalogSchemas) as [CatalogName, ...CatalogName[]]
const catalogName = z.enum(catalogNames)

function parseCatalog(name: string, data: unknown): Record<string, unknown> {
  const schema = catalogSchemas[name as CatalogName]
  if (!schema) throw errors.validation('Catálogo desconocido.')
  return schema.parse(data) as Record<string, unknown>
}

function route(
  handle: (ctx: SessionContext, input: never) => unknown,
  options: { permission?: string; anyPermission?: readonly string[]; schema?: ZodType; auth?: boolean } = {}
): Route {
  return {
    handle,
    permission: options.permission,
    anyPermission: options.anyPermission,
    schema: options.schema,
    auth: options.auth !== false
  }
}

/** Registra todos los canales. El renderer jamás envía SQL, rutas ni lógica de negocio. */
export function registerIpc(
  db: Db,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  opciones: {
    instanciasActivas?: () => number
    webContents?: () => Electron.WebContents | null
  } = {}
): void {
  const auth = createAuthService(db)
  const seguridad = createSeguridadService(db)
  const config = createConfiguracionService(db)
  const dashboard = createDashboardService(db)
  const maestros = createMaestrosService(db)
  const busqueda = createBusquedaService(db)
  const inventario = createInventarioService(db)
  const ventas = createVentasService(db, inventario)
  const pos = createPosService(db, ventas)
  const compras = createComprasService(db, inventario)
  const finanzas = createFinanzasService(db)
  const cobros = createCobrosService(db)
  const reportes = createReportesService(db)
  const ajustes = createAjustesService(db)
  const panel2026 = createPanel2026Service(db, ajustes, loadSettings)
  const preferenciasPanel = createPanelPreferenciasService(db, ajustes, loadSettings)
  const ejecutivo = createDashboardEjecutivoService(db, ajustes, loadSettings)
  const salud = createSaludService(db)
  const modulos2026 = createModulos2026Service(db)
  const contabilidad = createContabilidadService(db)
  const inteligencia = createInteligenciaService(db, ajustes)
  const espacio = createEspacioService(db)
  const impresion = createImpresionService(() => opciones.webContents?.() ?? null)
  const backups = createBackupsService({
    db,
    userDataPath: app.getPath('userData'),
    dbPath: join(app.getPath('userData'), 'data', 'enterprise.db'),
    instanciasActivas: opciones.instanciasActivas,
    reiniciar: () => { closeDatabase(); app.relaunch(); app.exit(0) }
  })

  const entidadPayload = z.object({ entidad: maestroEntidadSchema })
  const filtroProducto = z.object({ productoId: zId.optional() }).default({})

  const routes: Record<string, Route> = {
    'dashboard.resumen': route((ctx) => dashboard.resumen(ctx), { permission: 'dashboard.consultar' }),
    'auth.login': route(
      (_ctx, input) => {
        const res = auth.login(input as z.infer<typeof loginSchema>, 'ESTACION_LOCAL')
        // El token viaja una sola vez al preload; el contexto expuesto al renderer no lo incluye.
        return { ...res, context: res.context ? contextoPublico(res.context) : undefined }
      },
      { schema: loginSchema, auth: false }
    ),
    'auth.me': route((ctx) => ({
      ...contextoPublico(ctx),
      empresas: auth.userCompanies(ctx.userId)
    })),
    'auth.logout': route((ctx) => auth.logout(ctx)),
    'auth.switchCompany': route(
      (ctx, input) => {
        const res = auth.switchCompany(ctx, input as number, 'ESTACION_LOCAL')
        return {
          token: res.token,
          context: res.context ? contextoPublico(res.context) : undefined,
          debeCambiarClave: res.debeCambiarClave,
          empresas: res.empresas
        }
      },
      { schema: zId }
    ),
    'auth.changePassword': route(
      (ctx, input) => auth.changePassword(ctx, (input as { currentPassword: string }).currentPassword, (input as { newPassword: string }).newPassword),
      { schema: changePasswordSchema }
    ),
    'auth.resetPassword': route(
      (ctx, input) => auth.resetPassword(ctx, input as number),
      { schema: zId }
    ),

    'seguridad.users.list': route((ctx) => seguridad.listUsers(ctx), { permission: 'seguridad.consultar' }),
    'seguridad.users.get': route((ctx, input) => seguridad.getUser(ctx, input as number), { schema: zId, permission: 'seguridad.consultar' }),
    'seguridad.users.create': route((ctx, input) => seguridad.createUser(ctx, input as never), { schema: createUserSchema }),
    'seguridad.users.update': route((ctx, input) => seguridad.updateUser(ctx, input as never), { schema: updateUserSchema }),
    'seguridad.users.status': route(
      (ctx, input) => seguridad.setUserStatus(ctx, (input as { userId: number }).userId, (input as { field: 'activo' | 'bloqueado' }).field, (input as { value: boolean }).value),
      { schema: z.object({ userId: zId, field: z.enum(['activo', 'bloqueado']), value: z.boolean() }) }
    ),
    'seguridad.roles.list': route((ctx) => seguridad.listRoles(ctx), { permission: 'seguridad.consultar' }),
    'seguridad.roles.get': route((ctx, input) => seguridad.getRole(ctx, input as number), { schema: zId, permission: 'seguridad.consultar' }),
    'seguridad.roles.create': route((ctx, input) => seguridad.createRole(ctx, input as never), { schema: createRoleSchema }),
    'seguridad.roles.update': route(
      (ctx, input) => seguridad.updateRole(ctx, input as never),
      { schema: createRoleSchema.extend({ id: zId }) }
    ),
    'seguridad.roles.delete': route(
      (ctx, input) => seguridad.deleteRole(ctx, (input as { id: number }).id),
      { schema: deleteRoleSchema }
    ),
    // Canales del contrato IPC sin consumidor activo en el renderer actual. Se
    // conservan con permiso y validación para no romper roles o integraciones ya
    // desplegadas; no se inventa una pantalla ni se relaja su seguridad.
    'seguridad.permissions.list': route((ctx) => seguridad.listPermissions(ctx), { permission: 'seguridad.consultar' }),
    'seguridad.permissions.catalog': route((ctx) => seguridad.permissionCatalog(ctx), { permission: 'seguridad.consultar' }),
    'seguridad.permissions.custom.list': route(
      (ctx) => seguridad.listCustomPermissions(ctx),
      { permission: 'seguridad.consultar' }
    ),
    'seguridad.permissions.custom.save': route(
      (ctx, input) => seguridad.saveCustomPermission(ctx, input as never),
      { schema: customPermissionCreateSchema }
    ),
    'seguridad.permissions.custom.delete': route(
      (ctx, input) => seguridad.deleteCustomPermission(ctx, (input as { key: string }).key),
      { schema: customPermissionDeleteSchema }
    ),
    'seguridad.roles.permissions.get': route(
      (ctx, input) => seguridad.getRolePermissions(ctx, input as number),
      { schema: zId, permission: 'seguridad.consultar' }
    ),
    'seguridad.roles.permissions.replace': route(
      (ctx, input) => seguridad.replaceRolePermissions(ctx, input as never),
      { schema: rolePermissionsReplaceSchema }
    ),
    'seguridad.departments.list': route((ctx) => seguridad.listDepartments(ctx), { permission: 'seguridad.consultar' }),
    'seguridad.departments.create': route((ctx, input) => seguridad.createDepartment(ctx, input as string), { schema: string.min(2).max(60) }),
    'seguridad.sessions.list': route((ctx) => seguridad.listSessions(ctx)),
    'seguridad.sessions.close': route(
      (ctx, input) => seguridad.closeSession(ctx, input as number),
      { schema: zId }
    ),
    'seguridad.audit.list': route(
      (ctx, input) => seguridad.listAudit(ctx, input as never),
      { schema: z.object({
        fechaDesde: string.optional(), fechaHasta: string.optional(),
        usuarioId: zId.optional(), entidad: string.optional(), entidadId: string.optional(),
        operacion: string.optional(), texto: string.optional()
      }).default({}) }
    ),

    'maestros.list': route(
      (ctx, input) => maestros.list(ctx, input as { entidad: MaestroEntidad; incluirInactivos?: boolean }),
      { schema: entidadPayload.extend({ incluirInactivos: z.boolean().optional() }) }
    ),
    // Sin permiso global: el servicio decide entidad por entidad y nunca mezcla empresas.
    'busqueda.global': route(
      (ctx, input) => busqueda.global(ctx, input as BusquedaGlobalInput),
      { schema: busquedaGlobalSchema }
    ),
    // Sin invocador en la UI actual; se mantiene por compatibilidad del contrato IPC.
    'maestros.get': route(
      (ctx, input) => {
        const i = input as { entidad: MaestroEntidad; id: number }
        return maestros.get(ctx, i.entidad, i.id)
      },
      { schema: entidadPayload.extend({ id: zId }) }
    ),
    'maestros.save': route(
      (ctx, input) => {
        const i = input as { entidad: MaestroEntidad; data: unknown }
        return maestros.save(ctx, i.entidad, i.data)
      },
      { schema: entidadPayload.extend({ data: z.unknown() }) }
    ),
    'maestros.status': route(
      (ctx, input) => {
        const i = input as { entidad: MaestroEntidad; id: number; activo: boolean }
        return maestros.status(ctx, i.entidad, i.id, i.activo)
      },
      { schema: entidadPayload.extend({ id: zId, activo: z.boolean() }) }
    ),
    'maestros.delete': route(
      (ctx, input) => {
        const i = input as { entidad: MaestroEntidad; id: number }
        return maestros.remove(ctx, i.entidad, i.id)
      },
      { schema: entidadPayload.extend({ id: zId }) }
    ),
    'maestros.historial': route(
      (ctx, input) => maestros.historialPrecios(ctx, input as number),
      { schema: zId }
    ),
    'maestros.plantilla': route(
      (ctx, input) => maestros.plantilla(ctx, (input as { entidad: MaestroEntidad }).entidad),
      { schema: entidadPayload }
    ),
    'maestros.exportar': route(
      (ctx, input) => maestros.exportar(ctx, (input as { entidad: MaestroEntidad }).entidad),
      { schema: entidadPayload }
    ),
    'maestros.importar': route(
      (ctx, input) => {
        const i = input as { entidad: MaestroEntidad; base64: string }
        return maestros.importar(ctx, i.entidad, i.base64)
      },
      { schema: entidadPayload.extend({ base64: z.string().min(1).max(12_000_000) }) }
    ),

    'inventario.catalogos': route((ctx) => inventario.catalogos(ctx), { permission: 'inventario.consultar' }),
    'inventario.existencias': route(
      (ctx, input) => inventario.existencias(ctx, input as never),
      { schema: existenciasFiltroSchema, permission: 'inventario.consultar' }
    ),
    'inventario.kardex': route(
      (ctx, input) => inventario.kardex(ctx, input as never),
      { schema: kardexFiltroSchema, permission: 'inventario.consultar' }
    ),
    'inventario.costos': route(
      (ctx, input) => inventario.costos(ctx, input as number),
      { schema: zId }
    ),
    'inventario.movimiento': route(
      (ctx, input) => inventario.movimiento(ctx, input as never),
      { schema: movimientoSchema }
    ),
    'inventario.transferencia': route(
      (ctx, input) => inventario.transferencia(ctx, input as never),
      { schema: transferenciaSchema }
    ),
    'inventario.ajuste': route(
      (ctx, input) => inventario.ajuste(ctx, input as never),
      { schema: ajusteSchema }
    ),
    'inventario.anularTransferencia': route(
      (ctx, input) => inventario.anularTransferencia(ctx, (input as { id: number }).id),
      { schema: anularSchema }
    ),
    'inventario.anularAjuste': route(
      (ctx, input) => inventario.anularAjuste(ctx, (input as { id: number }).id),
      { schema: anularSchema }
    ),
    'inventario.transferencias': route((ctx) => inventario.transferencias(ctx), { permission: 'inventario.consultar' }),
    'inventario.ajustes': route((ctx) => inventario.ajustes(ctx), { permission: 'inventario.consultar' }),
    'inventario.detalleTransferencia': route(
      (ctx, input) => inventario.detalleTransferencia(ctx, input as number),
      { schema: zId }
    ),
    'inventario.detalleAjuste': route(
      (ctx, input) => inventario.detalleAjuste(ctx, input as number),
      { schema: zId }
    ),
    'inventario.series': route(
      (ctx, input) => inventario.series(ctx, (input as { productoId?: number }).productoId),
      { schema: filtroProducto }
    ),
    'inventario.serie.crear': route(
      (ctx, input) => inventario.crearSerie(ctx, input as never),
      { schema: serieProductoSchema }
    ),
    'inventario.lotes': route(
      (ctx, input) => inventario.lotes(ctx, (input as { productoId?: number }).productoId),
      { schema: filtroProducto }
    ),
    'inventario.lote.crear': route(
      (ctx, input) => inventario.crearLote(ctx, input as never),
      { schema: loteProductoSchema }
    ),
    'inventario.exportar': route(
      (ctx, input) => {
        const i = input as { vista: 'existencias' | 'kardex'; filtro?: unknown }
        return inventario.exportar(ctx, i.vista, i.filtro as never)
      },
      { schema: exportarInventarioSchema }
    ),

    'config.get': route((ctx) => config.getConfig(ctx), { permission: 'configuracion.consultar' }),
    'config.empresa.save': route((ctx, input) => config.saveEmpresa(ctx, input as Record<string, unknown>), { schema: empresaSchema }),
    'config.parametro.set': route(
      (ctx, input) => config.setParametro(ctx, (input as { clave: string }).clave, (input as { valor: unknown }).valor),
      { schema: parametroSchema }
    ),
    'config.catalog.save': route(
      (ctx, input) => {
        const { tabla, data } = input as { tabla: string; data: unknown }
        return config.saveCatalog(ctx, tabla, parseCatalog(tabla, data))
      },
      { schema: z.object({ tabla: catalogName, data: z.unknown() }) }
    ),
    'config.catalog.delete': route(
      (ctx, input) => config.deleteCatalog(ctx, (input as { tabla: string }).tabla, (input as { id: number }).id),
      { schema: z.object({ tabla: catalogName, id: zId }) }
    ),
    'config.tasa.save': route((ctx, input) => config.saveTasaCambio(ctx, input as never), { schema: tasaCambioSchema }),
    'config.formato.save': route((ctx, input) => config.saveFormato(ctx, input as never), { schema: formatoSchema }),
    // El canal histórico "reservar" quedó convertido en vista previa: nunca consume correlativos.
    'config.serie.reservar': route((ctx, input) => config.reservarNumero(ctx, input as string), { schema: string.min(2) }),
    'config.serie.preview': route((ctx, input) => config.vistaPreviaNumero(ctx, input as string), { schema: string.min(2) }),
    'config.series.estado': route((ctx) => config.estadoSeries(ctx)),
    // v0.5.0 — Centro de control: ajustes por empresa con permiso y auditoría.
    'config.ajustes.get': route(
      (ctx, input) => ajustes.get(ctx, input),
      { schema: ajustesGetSchema, permission: 'configuracion.ajustes.consultar' }
    ),
    'config.ajustes.save': route(
      (ctx, input) => ajustes.save(ctx, input),
      { schema: ajustesSaveSchema }
    ),
    // Sin permiso adicional: entrega solo los grupos visuales efectivos del usuario.
    'config.ajustes.efectivos': route((ctx) => ajustes.efectivos(ctx)),
    'config.ajustes.reset': route(
      (ctx, input) => ajustes.reset(ctx, input),
      { schema: ajustesResetSchema }
    ),
    // Capas por rol/permiso. Solo lectura para el usuario; escritura auditada para administradores.
    'config.ajustes.personalizados.list': route(
      (ctx, input) => ajustes.listPersonalizados(ctx, input),
      { schema: ajustesPersonalizadosGetSchema }
    ),
    'config.ajustes.personalizados.save': route(
      (ctx, input) => ajustes.savePersonalizado(ctx, input as never),
      { schema: ajustesPersonalizadoSaveSchema }
    ),
    'config.ajustes.personalizados.delete': route(
      (ctx, input) => ajustes.deletePersonalizado(ctx, input as never),
      { schema: ajustesPersonalizadoDeleteSchema }
    ),
    'config.backup.config': route(
      (ctx, input) => backups.configurar(ctx, input),
      { schema: backupConfigSchema, permission: 'configuracion.respaldo.crear' }
    ),

    'ventas.catalogos': route((ctx) => ventas.catalogos(ctx, 'ventas'), { permission: 'ventas.consultar' }),
    'pos.catalogos': route((ctx) => ventas.catalogos(ctx, 'pos'), { permission: 'pos.consultar' }),
    'cotizaciones.catalogos': route(
      (ctx) => ventas.catalogos(ctx, 'cotizaciones'),
      { permission: 'cotizaciones.consultar' }
    ),

    'ventas.documentos': route(
      (ctx, input) => ventas.documentos(ctx, input as never),
      { schema: documentosFiltroSchema, permission: 'ventas.consultar' }
    ),
    'ventas.detalle': route(
      (ctx, input) => ventas.detalle(ctx, input as number),
      { schema: zId }
    ),
    'ventas.factura.crear': route(
      (ctx, input) => ventas.factura(ctx, input as never),
      { schema: documentoVentaSchema }
    ),
    'ventas.anular': route(
      (ctx, input) => ventas.anular(ctx, input as never),
      { schema: anularDocumentoSchema }
    ),
    'ventas.convertir': route(
      (ctx, input) => ventas.convertir(ctx, input as never),
      { schema: convertirDocumentoSchema }
    ),
    'ventas.aprobar': route(
      (ctx, input) => ventas.aprobar(ctx, input as number),
      { schema: zId }
    ),
    'ventas.exportar': route(
      (ctx, input) => ventas.exportar(ctx, ((input as { filtro?: never }).filtro ?? {}) as never),
      { schema: exportarVentasSchema }
    ),
    'ventas.imprimir.datos': route(
      (ctx, input) => ventas.datosImpresion(ctx, input as never),
      { schema: imprimirDocumentoSchema }
    ),
    'ventas.conduces': route(
      (ctx) => ventas.conduces(ctx),
      { permission: 'ventas.consultar' }
    ),
    'ventas.conduce.crear': route(
      (ctx, input) => ventas.crearConduce(ctx, input as never),
      { schema: conduceSchema }
    ),
    'ventas.conduce.detalle': route(
      (ctx, input) => ventas.detalleConduce(ctx, input as number),
      { schema: zId, permission: 'ventas.consultar' }
    ),
    'ventas.conduce.entregar': route(
      (ctx, input) => ventas.registrarEntrega(ctx, input as never),
      { schema: entregaSchema }
    ),

    'cotizaciones.documentos': route(
      (ctx, input) => ventas.documentosCotizaciones(ctx, input as never),
      { schema: documentosFiltroSchema, permission: 'cotizaciones.consultar' }
    ),
    'cotizaciones.crear': route(
      (ctx, input) => ventas.cotizacion(ctx, input as never),
      { schema: cotizacionCarritoSchema }
    ),
    'cotizaciones.pedido.crear': route(
      (ctx, input) => ventas.pedido(ctx, input as never),
      { schema: cotizacionCarritoSchema }
    ),

    'pos.sesion': route((ctx) => pos.sesion(ctx)),
    'pos.caja.abrir': route(
      (ctx, input) => pos.abrirCaja(ctx, input as never),
      { schema: abrirCajaSchema }
    ),
    'pos.caja.cerrar': route(
      (ctx, input) => pos.cerrarCaja(ctx, input as never),
      { schema: cerrarCajaSchema }
    ),
    'pos.vender': route(
      (ctx, input) => pos.vender(ctx, input as never),
      { schema: posVentaSchema }
    ),
    'pos.suspender': route(
      (ctx, input) => pos.suspender(ctx, input as never),
      { schema: suspenderVentaSchema }
    ),
    'pos.suspendidas': route((ctx) => pos.suspendidas(ctx)),
    'pos.recuperar': route(
      (ctx, input) => pos.recuperar(ctx, input as number),
      { schema: zId }
    ),

    'compras.catalogos': route((ctx) => compras.catalogos(ctx), { permission: 'compras.consultar' }),
    'compras.documentos': route(
      (ctx, input) => compras.documentos(ctx, input as never),
      { schema: documentosFiltroCompraSchema, permission: 'compras.consultar' }
    ),
    // Sin invocador en la UI actual; se mantiene por compatibilidad del contrato IPC.
    'compras.cabeceras': route(
      (ctx, input) => compras.cabeceras(ctx, (input as { tipo: string }).tipo),
      { schema: z.object({ tipo: z.enum(tiposDocumentoCompra) }), permission: 'compras.consultar' }
    ),
    'compras.detalle': route(
      (ctx, input) => compras.detalle(ctx, input as number),
      { schema: zId }
    ),
    'compras.solicitud.crear': route(
      (ctx, input) => compras.solicitud(ctx, input as never),
      { schema: documentoCompraSchema }
    ),
    'compras.orden.crear': route(
      (ctx, input) => compras.orden(ctx, input as never),
      { schema: documentoCompraSchema }
    ),
    'compras.factura.crear': route(
      (ctx, input) => compras.factura(ctx, input as never),
      { schema: documentoCompraSchema }
    ),
    'compras.ingreso.crear': route(
      (ctx, input) => compras.ingreso(ctx, input as never),
      { schema: ingresoMercanciaSchema }
    ),
    'compras.ingreso.editar': route(
      (ctx, input) => compras.editarIngreso(ctx, input as never),
      { schema: editarIngresoSchema }
    ),
    'compras.ingreso.historial': route(
      (ctx, input) => compras.historial(ctx, (input as never) ?? undefined),
      { schema: historialIngresoSchema, permission: 'compras.historial' }
    ),
    'compras.devolucion.crear': route(
      (ctx, input) => compras.devolucion(ctx, input as never),
      { schema: documentoCompraSchema }
    ),
    'compras.recepcion.crear': route(
      (ctx, input) => compras.registrarRecepcion(ctx, input as never),
      { schema: recepcionSchema }
    ),
    'compras.convertir': route(
      (ctx, input) => compras.convertir(ctx, input as never),
      { schema: convertirCompraSchema }
    ),
    'compras.aprobar': route(
      (ctx, input) => compras.aprobar(ctx, input as number),
      { schema: zId }
    ),
    'compras.anular': route(
      (ctx, input) => compras.anular(ctx, input as never),
      { schema: anularCompraSchema }
    ),
    'compras.imprimir.datos': route(
      (ctx, input) => compras.datosImpresion(ctx, input as never),
      { schema: imprimirCompraSchema }
    ),
    'compras.exportar': route(
      (ctx, input) => compras.exportar(ctx, ((input as { filtro?: never }).filtro ?? {}) as never),
      { schema: exportarComprasSchema }
    ),

    // Cobros: área independiente de Ventas. La fachada verifica permisos propios.
    'cobros.documentos': route((ctx, input) => cobros.documentos(ctx, input as never), { schema: finanzasFiltroSchema }),
    'cobros.recibos': route((ctx, input) => cobros.recibos(ctx, input as never), { schema: finanzasFiltroSchema }),
    'cobros.anticipos': route((ctx, input) => cobros.anticipos(ctx, input as never), { schema: finanzasFiltroSchema }),
    'cobros.detalle': route((ctx, input) => cobros.detalle(ctx, input as never), { schema: referenciaFinanzasSchema }),
    'cobros.recibo.crear': route((ctx, input) => cobros.cobrar(ctx, input as never), { schema: cxcReciboCrearSchema }),
    'cobros.anticipo.crear': route((ctx, input) => cobros.anticipar(ctx, input as never), { schema: anticipoCrearSchema }),
    'cobros.recibo.anular': route((ctx, input) => cobros.anular(ctx, input as never), { schema: anularFinanzasSchema }),
    'cobros.imprimir': route((ctx, input) => cobros.imprimir(ctx, input as never), { schema: imprimirFinanzasSchema }),
    'cobros.exportar': route((ctx, input) => cobros.exportar(ctx, input as never), { schema: exportarFinanzasSchema }),

    // Fase 8 — Finanzas. El permiso fino se verifica también dentro del servicio.
    'finanzas.catalogos': route((ctx) => finanzas.catalogos(ctx)),

    'cxc.documentos': route(
      (ctx, input) => finanzas.cxcDocumentos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'cxc.consultar' }
    ),
    'cxc.recibos': route(
      (ctx, input) => finanzas.cxcRecibos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'cxc.consultar' }
    ),
    'cxc.anticipos': route(
      (ctx, input) => finanzas.cxcAnticipos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'cxc.consultar' }
    ),
    'cxc.detalle': route(
      (ctx, input) => finanzas.cxcDetalle(ctx, input as never),
      { schema: referenciaFinanzasSchema, permission: 'cxc.consultar' }
    ),
    'cxc.recibo.crear': route(
      (ctx, input) => finanzas.cxcReciboCrear(ctx, input as never),
      { schema: cxcReciboCrearSchema, permission: 'cxc.crear' }
    ),
    'cxc.recibo.anular': route(
      (ctx, input) => finanzas.cxcReciboAnular(ctx, input as never),
      { schema: anularFinanzasSchema, permission: 'cxc.anular' }
    ),
    'cxc.anticipo.crear': route(
      (ctx, input) => finanzas.anticipoCrear(
        ctx, { ...(input as object), tipo: 'CLIENTE' } as never
      ),
      { schema: anticipoCrearSchema, permission: 'cxc.crear' }
    ),
    'cxc.imprimir.datos': route(
      (ctx, input) => finanzas.cxcImprimir(ctx, input as never),
      { schema: imprimirFinanzasSchema, permission: 'cxc.imprimir' }
    ),
    'cxc.exportar': route(
      (ctx, input) => finanzas.cxcExportar(ctx, input as never),
      { schema: exportarFinanzasSchema, permission: 'cxc.exportar' }
    ),

    'cxp.documentos': route(
      (ctx, input) => finanzas.cxpDocumentos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'cxp.consultar' }
    ),
    'cxp.pagos': route(
      (ctx, input) => finanzas.cxpPagos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'cxp.consultar' }
    ),
    'cxp.anticipos': route(
      (ctx, input) => finanzas.cxpAnticipos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'cxp.consultar' }
    ),
    'cxp.detalle': route(
      (ctx, input) => finanzas.cxpDetalle(ctx, input as never),
      { schema: referenciaFinanzasSchema, permission: 'cxp.consultar' }
    ),
    'cxp.pago.crear': route(
      (ctx, input) => finanzas.cxpPagoCrear(ctx, input as never),
      { schema: cxpPagoCrearSchema, permission: 'cxp.crear' }
    ),
    'cxp.pago.anular': route(
      (ctx, input) => finanzas.cxpPagoAnular(ctx, input as never),
      { schema: anularFinanzasSchema, permission: 'cxp.anular' }
    ),
    'cxp.anticipo.crear': route(
      (ctx, input) => finanzas.anticipoCrear(
        ctx, { ...(input as object), tipo: 'PROVEEDOR' } as never
      ),
      { schema: anticipoCrearSchema, permission: 'cxp.crear' }
    ),
    'cxp.imprimir.datos': route(
      (ctx, input) => finanzas.cxpImprimir(ctx, input as never),
      { schema: imprimirFinanzasSchema, permission: 'cxp.imprimir' }
    ),
    'cxp.exportar': route(
      (ctx, input) => finanzas.cxpExportar(ctx, input as never),
      { schema: exportarFinanzasSchema, permission: 'cxp.exportar' }
    ),

    'bancos.cuentas': route(
      (ctx) => finanzas.bancosCuentas(ctx), { permission: 'bancos.consultar' }
    ),
    'bancos.cuenta.crear': route(
      (ctx, input) => finanzas.bancosCuentaCrear(ctx, input as never),
      { schema: bancoCuentaSchema, permission: 'bancos.crear' }
    ),
    'bancos.movimientos': route(
      (ctx, input) => finanzas.bancosMovimientos(ctx, input as never),
      { schema: movimientosBancoFiltroSchema, permission: 'bancos.consultar' }
    ),
    'bancos.movimiento.crear': route(
      (ctx, input) => finanzas.bancosMovimientoCrear(ctx, input as never),
      { schema: bancoMovimientoSchema, permission: 'bancos.crear' }
    ),
    'bancos.movimiento.anular': route(
      (ctx, input) => finanzas.bancosMovimientoAnular(ctx, input as never),
      { schema: anularFinanzasSchema, permission: 'bancos.anular' }
    ),
    'bancos.conciliaciones': route(
      (ctx, input) => finanzas.bancosConciliaciones(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'bancos.consultar' }
    ),
    'bancos.conciliacion.crear': route(
      (ctx, input) => finanzas.bancosConciliacionCrear(ctx, input as never),
      { schema: bancoConciliacionSchema, permission: 'bancos.crear' }
    ),
    'bancos.imprimir.datos': route(
      (ctx, input) => finanzas.bancosImprimir(ctx, input as never),
      { schema: imprimirFinanzasSchema, permission: 'bancos.imprimir' }
    ),

    'cajas.sesiones': route(
      (ctx, input) => finanzas.cajasSesiones(ctx, input as never),
      { schema: sesionesCajaFiltroSchema, permission: 'cajas.consultar' }
    ),
    'cajas.cierreAutomatico': route(
      (ctx) => finanzas.cajaCierreAutomatico(ctx),
      { permission: 'cajas.consultar' }
    ),
    'cajas.detalle': route(
      (ctx, input) => finanzas.cajasDetalle(ctx, input as number),
      { schema: zId, permission: 'cajas.consultar' }
    ),
    'cajas.abrir': route(
      (ctx, input) => finanzas.cajasAbrir(ctx, input as never),
      { schema: abrirCajaFinanzasSchema, permission: 'cajas.abrir_caja' }
    ),
    'cajas.cerrar': route(
      (ctx, input) => finanzas.cajasCerrar(ctx, input as never),
      { schema: cerrarCajaFinanzasSchema, permission: 'cajas.cerrar_caja' }
    ),
    'cajas.movimiento.crear': route(
      (ctx, input) => finanzas.cajasMovimientoCrear(ctx, input as never),
      { schema: movimientoCajaManualSchema, permission: 'cajas.crear' }
    ),
    'cajas.imprimir.datos': route(
      (ctx, input) => finanzas.cajasImprimir(ctx, input as never),
      { schema: imprimirFinanzasSchema, permission: 'cajas.imprimir' }
    ),

    'gastos.categorias': route(
      (ctx) => finanzas.gastosCategorias(ctx), { permission: 'gastos.consultar' }
    ),
    'gastos.categoria.crear': route(
      (ctx, input) => finanzas.gastosCategoriaCrear(ctx, input as never),
      { schema: gastoCategoriaSchema, permission: 'gastos.crear' }
    ),
    'gastos.documentos': route(
      (ctx, input) => finanzas.gastosDocumentos(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'gastos.consultar' }
    ),
    'gastos.detalle': route(
      (ctx, input) => finanzas.gastosDetalle(ctx, input as number),
      { schema: zId, permission: 'gastos.consultar' }
    ),
    'gastos.crear': route(
      (ctx, input) => finanzas.gastosCrear(ctx, input as never),
      { schema: gastoCrearSchema, permission: 'gastos.crear' }
    ),
    'gastos.pagar': route(
      (ctx, input) => finanzas.gastosPagar(ctx, input as never),
      { schema: gastoPagarSchema, permission: 'gastos.aprobar' }
    ),
    'gastos.anular': route(
      (ctx, input) => finanzas.gastosAnular(ctx, input as never),
      { schema: anularFinanzasSchema, permission: 'gastos.anular' }
    ),
    'gastos.recurrentes': route(
      (ctx, input) => finanzas.gastosRecurrentes(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'gastos.consultar' }
    ),
    'gastos.recurrente.crear': route(
      (ctx, input) => finanzas.gastosRecurrenteCrear(ctx, input as never),
      { schema: gastoRecurrenteSchema, permission: 'gastos.crear' }
    ),
    'gastos.recurrente.generar': route(
      (ctx, input) => finanzas.gastosRecurrenteGenerar(ctx, input as number),
      { schema: zId, permission: 'gastos.crear' }
    ),
    'comisiones.list': route(
      (ctx, input) => finanzas.comisionesList(ctx, input as never),
      { schema: finanzasFiltroSchema, permission: 'gastos.consultar' }
    ),
    'comisiones.crear': route(
      (ctx, input) => finanzas.comisionCrear(ctx, input as never),
      { schema: comisionCrearSchema, permission: 'gastos.crear' }
    ),
    'comisiones.pagar': route(
      (ctx, input) => finanzas.comisionPagar(ctx, input as never),
      { schema: comisionPagarSchema, permission: 'gastos.aprobar' }
    ),

    // Fase 9 — Reportes y estadísticas. Los permisos finos se comprueban también en el servicio.
    'reportes.indicadores': route(
      (ctx) => reportes.indicadores(ctx),
      { permission: 'reportes.consultar' }
    ),
    'reportes.serie': route(
      (ctx, input) => reportes.serie(ctx, input as never),
      { schema: reportesSerieSchema, permission: 'reportes.consultar' }
    ),
    'reportes.consultar': route(
      (ctx, input) => reportes.datosReporte(ctx, (input as { reporte: never; filtro?: never }).reporte, (input as { filtro?: never }).filtro),
      { schema: reportesConsultaSchema, permission: 'reportes.consultar' }
    ),
    'reportes.exportar': route(
      (ctx, input) => reportes.exportar(ctx, input as never),
      { schema: reportesExportarSchema, permission: 'reportes.exportar' }
    ),
    'reportes.imprimir': route(
      (ctx, input) => reportes.imprimir(ctx, input as never),
      { schema: reportesImprimirSchema, permission: 'reportes.imprimir' }
    ),

    // PDF real (pdfmake): reutiliza los servicios de impresión y sus permisos.
    'pdf.generar': route(
      (ctx, input) => generarPdf(ctx, input as never, { ventas, compras, finanzas, cobros, reportes }),
      { schema: pdfGenerarSchema }
    ),

    // Impresoras reales de Windows: solo se consultan y se usa `webContents.print`.
    // Cada canal exige permiso: configuración para detectar y cualquier permiso
    // de impresión de documento para enviar el área ya preparada al motor nativo.
    'impresoras.listar': route(
      () => impresion.listar(),
      { permission: 'configuracion.impresoras.consultar' }
    ),
    'impresion.ejecutar': route(
      (_ctx, input) => impresion.ejecutar(input as never),
      { schema: impresionEjecutarSchema, anyPermission: permisosImpresion }
    ),

    // Espacio de trabajo: panel, comprobantes, herramientas y personalización.
    // Los permisos finos se comprueban en el servicio y en cada fuente de impresión.
    'espacio.resumen': route(
      (ctx, input) => espacio.resumen(ctx, input),
      { schema: espacioFiltroSchema, permission: 'espacio.consultar' }
    ),
    'espacio.comprobantes': route(
      (ctx, input) => espacio.comprobantes(ctx, input),
      { schema: espacioComprobantesFiltroSchema, permission: 'espacio.consultar' }
    ),
    'espacio.comprobantes.exportar': route(
      (ctx, input) => espacio.exportar(ctx, input),
      { schema: espacioComprobantesFiltroSchema, permission: 'espacio.exportar' }
    ),
    'espacio.diagnostico': route(
      (ctx) => espacio.diagnosticar(ctx),
      { permission: 'espacio.consultar' }
    ),
    'espacio.reindex': route(
      (ctx, input) => espacio.reindexar(ctx, input),
      { schema: espacioReindexSchema, permission: 'espacio.mantenimiento' }
    ),
    'espacio.presets.list': route(
      (ctx) => espacio.listarPresets(ctx),
      { permission: 'espacio.consultar' }
    ),
    'espacio.presets.save': route(
      (ctx, input) => espacio.guardarPreset(ctx, input),
      { schema: espacioPresetSchema, permission: 'espacio.modificar' }
    ),
    'espacio.presets.delete': route(
      (ctx, input) => espacio.eliminarPreset(ctx, input),
      { schema: espacioPresetIdSchema, permission: 'espacio.modificar' }
    ),
    'espacio.emisiones.list': route(
      (ctx) => espacio.historialEmisiones(ctx),
      { permission: 'espacio.consultar' }
    ),
    'espacio.comprobante.emitir': route(
      async (ctx, input) => {
        const solicitud = input as EspacioComprobanteEmitir
        const archivo = await generarPdf(
          ctx,
          { origen: solicitud.origen, id: solicitud.id, formato: solicitud.formato, tipo: 'DOCUMENTO' },
          { ventas, compras, finanzas, cobros, reportes }
        )
        espacio.registrarEmision(ctx, solicitud, archivo)
        return archivo
      },
      { schema: espacioComprobanteEmitirSchema, permission: 'espacio.imprimir' }
    ),

    // Fase 10 — Auditoría y respaldos. La auditoría ya funcionaba desde la Fase 3.
    'respaldos.historial': route(
      (ctx) => backups.historial(ctx),
      { schema: respaldosHistorialSchema, permission: 'respaldos.consultar' }
    ),
    'respaldos.crear': route(
      (ctx, input) => backups.crear(ctx, input as never),
      { schema: respaldosCrearSchema, permission: 'configuracion.respaldo.crear' }
    ),
    'respaldos.integridad': route(
      (ctx, input) => backups.integridad(ctx, input as never),
      { schema: respaldosIntegridadSchema, permission: 'respaldos.consultar' }
    ),
    'respaldos.restaurar': route(
      (ctx, input) => backups.restaurar(ctx, input as never),
      { schema: respaldosRestaurarSchema, permission: 'configuracion.respaldo.restaurar' }
    ),

    // v0.3.0 — Panel ejecutivo, salud del sistema y módulos nuevos.
    'dashboard.ejecutivo': route(
      (ctx, input) => ejecutivo.resumen(ctx, input as never),
      { schema: dashboardEjecutivoSchema, permission: 'dashboard.consultar' }
    ),
    'salud.resumen': route(
      (ctx) => salud.resumen(ctx),
      { permission: 'salud.consultar' }
    ),
    // Panel 2026: el renderer solo envía un filtro validado; los ajustes se leen en backend.
    'panel2026.resumen': route(
      (ctx, input) => panel2026.resumen(ctx, input as never),
      { schema: panel2026FiltroSchema, permission: 'inteligencia.consultar' }
    ),
    'panel.preferencias.get': route(
      (ctx) => preferenciasPanel.get(ctx),
      { permission: 'dashboard.consultar' }
    ),
    // v0.5.0 — Inteligencia operativa: solo lectura, cálculos locales reales.
    'inteligencia.resumen': route(
      (ctx, input) => inteligencia.resumen(ctx, input as never),
      { schema: inteligenciaFiltroSchema, permission: 'inteligencia.consultar' }
    ),

    // Tablero horizontal avanzado: una sola llamada, sin permisos nuevos.
    // Cada sección se resuelve por permiso real; las denegadas se informan
    // al renderer en lugar de filter datos que el usuario no puede ver.
    'panel.horizontal.resumen': route((ctx, input) => {
      const filtro = panelHorizontalFiltroSchema.parse(input ?? {})
      const datos: PanelHorizontalRespuesta['datos'] = {
        cobranza: null, inventario: null, agenda: null, presupuesto: null, cuadre: null
      }
      const permitidos: PanelHorizontalId[] = []
      const denegados: PanelHorizontalRespuesta['denegados'] = []
      const permisos: Record<PanelHorizontalId, string[]> = {
        cobranza: ['cxc.consultar'],
        inventario: ['inventario.consultar'],
        agenda: ['servicios.consultar', 'crm.consultar'],
        presupuesto: ['presupuestos.consultar'],
        cuadre: ['cajas.consultar', 'bancos.consultar']
      }
      const resolver: Record<PanelHorizontalId, () => void> = {
        cobranza: () => { datos.cobranza = finanzas.colaCobro(ctx, filtro) },
        inventario: () => { datos.inventario = inteligencia.rankingAbc(ctx, filtro) },
        agenda: () => { datos.agenda = modulos2026.agendaOperativa(ctx, filtro) },
        presupuesto: () => { datos.presupuesto = modulos2026.presupuestoDesviaciones(ctx, filtro) },
        cuadre: () => { datos.cuadre = finanzas.cuadreOperativo(ctx, filtro) }
      }
      for (const id of panelHorizontalIds) {
        if (permisos[id].some((permiso) => ctx.permisos.includes(permiso))) {
          resolver[id]()
          permitidos.push(id)
        } else {
          denegados.push({ id, motivo: `Requiere ${permisos[id].join(' o ')}.` })
        }
      }
      return { datos, permitidos, denegados }
    }, { schema: panelHorizontalFiltroSchema }),

    'presupuestos.list': route(
      (ctx, input) => modulos2026.presupuestos(ctx, input as never),
      { schema: filtroModulosSchema, permission: 'presupuestos.consultar' }
    ),
    'presupuestos.detalle': route(
      (ctx, input) => modulos2026.presupuestoDetalle(ctx, input as number),
      { schema: idModuloSchema, permission: 'presupuestos.consultar' }
    ),
    'presupuestos.crear': route(
      (ctx, input) => modulos2026.presupuestoCrear(ctx, input as never),
      { schema: presupuestoCrearSchema, permission: 'presupuestos.crear' }
    ),
    'presupuestos.estado': route(
      (ctx, input) => modulos2026.cambiarPresupuestoEstado(ctx, input as never),
      { schema: cambiarEstadoSchema }
    ),
    'presupuestos.ejecutar': route(
      (ctx, input) => modulos2026.presupuestoEjecutar(ctx, input as never),
      { schema: presupuestoEjecutarSchema, permission: 'presupuestos.ejecutar' }
    ),

    'servicios.catalogo': route(
      (ctx) => modulos2026.serviciosCatalogo(ctx),
      { permission: 'servicios.consultar' }
    ),
    'servicios.catalogo.crear': route(
      (ctx, input) => modulos2026.servicioCatalogoCrear(ctx, input as never),
      { schema: servicioCatalogoSchema, permission: 'servicios.crear' }
    ),
    'servicios.ordenes': route(
      (ctx, input) => modulos2026.ordenesServicio(ctx, input as never),
      { schema: filtroModulosSchema, permission: 'servicios.consultar' }
    ),
    'servicios.orden.detalle': route(
      (ctx, input) => modulos2026.ordenServicioDetalle(ctx, input as number),
      { schema: idModuloSchema, permission: 'servicios.consultar' }
    ),
    'servicios.orden.crear': route(
      (ctx, input) => modulos2026.ordenServicioCrear(ctx, input as never),
      { schema: ordenServicioCrearSchema, permission: 'servicios.crear' }
    ),
    'servicios.orden.estado': route(
      (ctx, input) => modulos2026.ordenServicioEstado(ctx, input as never),
      { schema: cambiarEstadoSchema }
    ),

    'activos.list': route(
      (ctx, input) => modulos2026.activos(ctx, input as never),
      { schema: filtroModulosSchema, permission: 'activos.consultar' }
    ),
    'activos.detalle': route(
      (ctx, input) => modulos2026.activoDetalle(ctx, input as number),
      { schema: idModuloSchema, permission: 'activos.consultar' }
    ),
    'activos.crear': route(
      (ctx, input) => modulos2026.activoCrear(ctx, input as never),
      { schema: activoCrearSchema, permission: 'activos.crear' }
    ),
    'activos.depreciar': route(
      (ctx, input) => modulos2026.activoDepreciar(ctx, input as never),
      { schema: activoDepreciarSchema, permission: 'activos.depreciar' }
    ),
    'activos.estado': route(
      (ctx, input) => modulos2026.activoBaja(ctx, input as never),
      { schema: cambiarEstadoSchema, permission: 'activos.modificar' }
    ),

    'crm.leads': route(
      (ctx, input) => modulos2026.leads(ctx, input as never),
      { schema: filtroModulosSchema, permission: 'crm.consultar' }
    ),
    'crm.lead.crear': route(
      (ctx, input) => modulos2026.leadCrear(ctx, input as never),
      { schema: leadCrearSchema, permission: 'crm.crear' }
    ),
    'crm.lead.estado': route(
      (ctx, input) => modulos2026.leadEstado(ctx, input as never),
      { schema: leadEstadoSchema, permission: 'crm.modificar' }
    ),
    'crm.seguimiento.crear': route(
      (ctx, input) => modulos2026.seguimientoCrear(ctx, input as never),
      { schema: seguimientoCrearSchema, permission: 'crm.crear' }
    ),
    'crm.lead.convertir': route(
      (ctx, input) => modulos2026.leadConvertir(ctx, input as never),
      { schema: leadConvertirSchema, permission: 'crm.convertir' }
    ),

    // 0.4.0 — Contabilidad general. Permisos verificados también en el servicio.
    'cont.cuentas': route(
      (ctx, input) => contabilidad.cuentas(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.cuenta.crear': route(
      (ctx, input) => contabilidad.cuentaCrear(ctx, input as never),
      { schema: cuentaCrearSchema, permission: 'contabilidad.crear' }
    ),
    'cont.cuenta.modificar': route(
      (ctx, input) => contabilidad.cuentaModificar(ctx, input as never),
      { schema: cuentaModificarSchema, permission: 'contabilidad.modificar' }
    ),
    'cont.cuenta.estado': route(
      (ctx, input) => contabilidad.cuentaEstado(ctx, input as never),
      { schema: cuentaEstadoSchema, permission: 'contabilidad.modificar' }
    ),
    'cont.periodos': route(
      (ctx, input) => contabilidad.periodos(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.periodo.abrir': route(
      (ctx, input) => contabilidad.periodoAbrir(ctx, input as never),
      { schema: periodoAbrirSchema, permission: 'contabilidad.crear' }
    ),
    'cont.periodo.cerrar': route(
      (ctx, input) => contabilidad.periodoCerrar(ctx, input as never),
      { schema: periodoCerrarSchema, permission: 'contabilidad.periodo.cerrar' }
    ),
    'cont.asientos': route(
      (ctx, input) => contabilidad.asientos(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.asiento.crear': route(
      (ctx, input) => contabilidad.asientoCrear(ctx, input as never),
      { schema: asientoCrearSchema, permission: 'contabilidad.crear' }
    ),
    'cont.asiento.confirmar': route(
      (ctx, input) => contabilidad.asientoConfirmar(ctx, input as never),
      { schema: asientoEstadoSchema, permission: 'contabilidad.asiento.confirmar' }
    ),
    'cont.asiento.anular': route(
      (ctx, input) => contabilidad.asientoAnular(ctx, input as never),
      { schema: asientoEstadoSchema, permission: 'contabilidad.anular' }
    ),
    'cont.libroDiario': route(
      (ctx, input) => contabilidad.libroDiario(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.mayor': route(
      (ctx, input) => contabilidad.mayor(ctx, input as never),
      { schema: mayorSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.balanceComprobacion': route(
      (ctx, input) => contabilidad.balanceComprobacion(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.estadoResultados': route(
      (ctx, input) => contabilidad.estadoResultados(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.balanceGeneral': route(
      (ctx, input) => contabilidad.balanceGeneral(ctx, input as never),
      { schema: filtroContabilidadSchema, permission: 'contabilidad.consultar' }
    ),
    'cont.integrar': route(
      (ctx, input) => contabilidad.integrarDocumentos(ctx, input as never),
      { schema: integrarSchema, permission: 'contabilidad.integrar' }
    )
  }

  for (const [channel, r] of Object.entries(routes)) {
    ipcMain.handle(channel, async (event, envelope: Envelope): Promise<unknown> => {
      try {
        if (!isTrusted(event)) throw errors.forbidden()
        const payload = (envelope ?? {}) as Envelope
        // Orden crítico: sesión → cambio de clave → permiso → validación Zod → servicio.
        let ctx: SessionContext
        if (r.auth) {
          if (!payload.token) throw errors.unauthorized()
          ctx = buildContext(db, payload.token)
          assertCanProceed(ctx, channel)
          if (r.permission && !ctx.permisos.includes(r.permission)) throw errors.forbidden()
          if (r.anyPermission && !r.anyPermission.some((p) => ctx.permisos.includes(p))) {
            throw errors.forbidden()
          }
        } else {
          ctx = {} as SessionContext
        }
        let input: unknown = payload.input
        if (r.schema) {
          if (input === undefined) {
            // Nunca parsear el sobre completo: el token no debe filtrarse al
            // servicio. Si el esquema admite ausencia, aplica sus defaults; si
            // no, `{}` conserva el error de validación de los campos exigidos.
            const sinInput = r.schema.safeParse(undefined)
            input = sinInput.success ? sinInput.data : r.schema.parse({})
          } else {
            input = r.schema.parse(input)
          }
        }
        return await r.handle(ctx, input as never)
      } catch (error) {
        throw encodeIpcError(serializeError(error))
      }
    })
  }
}
