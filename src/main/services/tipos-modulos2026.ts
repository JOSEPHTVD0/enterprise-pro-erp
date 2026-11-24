import type { z } from 'zod'
import type {
  filtroModulosSchema, cambiarEstadoSchema, presupuestoCrearSchema, presupuestoEjecutarSchema,
  servicioCatalogoSchema, ordenServicioCrearSchema, activoCrearSchema, activoDepreciarSchema,
  leadCrearSchema, leadEstadoSchema, seguimientoCrearSchema, leadConvertirSchema
} from '@shared/schemas/modulos2026'

/** Tipos de ENTRADA: Zod aplica los defaults en el router; el servicio también los tolera. */
export type FiltroModulos = z.input<typeof filtroModulosSchema>
export type CambiarEstado = z.input<typeof cambiarEstadoSchema>
export type PresupuestoCrear = z.input<typeof presupuestoCrearSchema>
export type PresupuestoEjecutar = z.input<typeof presupuestoEjecutarSchema>
export type ServicioCatalogo = z.input<typeof servicioCatalogoSchema>
export type OrdenServicioCrear = z.input<typeof ordenServicioCrearSchema>
export type ActivoCrear = z.input<typeof activoCrearSchema>
export type ActivoDepreciar = z.input<typeof activoDepreciarSchema>
export type LeadCrear = z.input<typeof leadCrearSchema>
export type LeadEstado = z.input<typeof leadEstadoSchema>
export type SeguimientoCrear = z.input<typeof seguimientoCrearSchema>
export type LeadConvertir = z.input<typeof leadConvertirSchema>
