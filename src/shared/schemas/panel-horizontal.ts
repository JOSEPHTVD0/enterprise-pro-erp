import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'

/** Filtro único del tablero horizontal avanzado. Todo importe viaja en centavos. */
export const panelHorizontalFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD.').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD.').optional(),
  texto: z.string().trim().max(60).default(''),
  limite: z.number().int().min(1).max(50).default(8),
  soloUrgentes: z.boolean().default(false)
}))

export type PanelHorizontalFiltro = z.infer<typeof panelHorizontalFiltroSchema>

export const panelHorizontalIds = ['cobranza', 'inventario', 'agenda', 'presupuesto', 'cuadre'] as const
export type PanelHorizontalId = (typeof panelHorizontalIds)[number]

export const panelHorizontalOrdenSchema = z.array(z.enum(panelHorizontalIds))
  .length(panelHorizontalIds.length)
  .refine((valor) => new Set(valor).size === valor.length, 'El orden no puede repetir paneles.')

export const panelHorizontalColapsadosSchema = z.object({
  cobranza: z.boolean().optional(),
  inventario: z.boolean().optional(),
  agenda: z.boolean().optional(),
  presupuesto: z.boolean().optional(),
  cuadre: z.boolean().optional()
}).default({})

// ------------------------------- Respuestas ---------------------------------

export interface CobranzaFila {
  id: number
  numero: string
  cliente: string
  saldoCent: number
  vencimiento: string
  diasVencido: number
  bucket: 'CORRIENTE' | '1_15' | '16_30' | '31_60' | 'MAS_60'
  ultimoRecibo: string
  excesoCreditoCent: number
  score: number
  sugerencia: string
  urgente: boolean
}

export interface CobranzaDatos {
  filtro: PanelHorizontalFiltro
  umbralDias: number
  resumen: { documentos: number; saldoCent: number; urgentes: number; vencidos: number }
  filas: CobranzaFila[]
}

export interface InventarioFila {
  productoId: number
  almacenId: number
  codigo: string
  producto: string
  almacen: string
  existencia: number
  consumo: number
  coberturaDias: number | null
  clase: 'A' | 'B' | 'C'
  nivel: 'CRITICO' | 'BAJO' | 'NORMAL'
  valorReposicionCent: number
  costoOculto: boolean
}

export interface InventarioDatos {
  filtro: PanelHorizontalFiltro
  umbralStock: number
  resumen: { productos: number; criticos: number; valorReposicionCent: number }
  filas: InventarioFila[]
}

export interface AgendaOrden {
  id: number
  numero: string
  cliente: string
  fechaCompromiso: string
  estado: string
  prioridad: string
  tecnico: string
  minutos: number
  vencida: boolean
}

export interface AgendaLead {
  id: number
  nombre: string
  empresa: string
  estado: string
  probabilidad: number
  valorEstimadoCent: number
  proximoSeguimiento: string
  ultimoContacto: string
  vencido: boolean
}

export interface AgendaDatos {
  filtro: PanelHorizontalFiltro
  secciones: { servicios: boolean; crm: boolean }
  resumen: { ordenesVencidas: number; ordenesHoy: number; leadsVencidos: number; minutos: number }
  ordenes: AgendaOrden[]
  leads: AgendaLead[]
  cargaTecnico: { tecnico: string; ordenes: number; minutos: number }[]
}

export interface PresupuestoFila {
  presupuestoId: number
  numero: string
  categoria: string
  descripcion: string
  montoCent: number
  ejecutadoCent: number
  disponibleCent: number
  pctEjecutado: number
  nivel: 'CRITICO' | 'ALERTA' | 'NORMAL'
  estado: string
}

export interface PresupuestoDatos {
  filtro: PanelHorizontalFiltro
  umbralPct: number
  resumen: { lineas: number; enAlerta: number; disponibleCent: number }
  filas: PresupuestoFila[]
}

export interface CuadreCaja {
  sesionId: number
  cajaId: number
  fechaApertura: string
  estado: string
  teoricoCent: number
  arqueoCent: number
  diferenciaCent: number
}

export interface CuadreBanco {
  cuentaId: number
  cuenta: string
  saldoLibroCent: number
  saldoBancoCent: number | null
  diferenciaCent: number | null
  noConciliados: number
}

export interface CuadreMovimiento {
  id: number
  cuentaId: number
  fecha: string
  tipo: string
  montoCent: number
  referencia: string
}

export interface CuadreDatos {
  filtro: PanelHorizontalFiltro
  secciones: { cajas: boolean; bancos: boolean }
  resumen: { sesionesAbiertas: number; diferenciasCent: number; sinSoporte: number; cuentas: number }
  caja: CuadreCaja[]
  banco: CuadreBanco[]
  movimientosSinSoporte: CuadreMovimiento[]
}

export interface PanelHorizontalDatos {
  cobranza: CobranzaDatos | null
  inventario: InventarioDatos | null
  agenda: AgendaDatos | null
  presupuesto: PresupuestoDatos | null
  cuadre: CuadreDatos | null
}

export interface PanelHorizontalRespuesta {
  datos: PanelHorizontalDatos
  permitidos: PanelHorizontalId[]
  denegados: { id: PanelHorizontalId; motivo: string }[]
}
