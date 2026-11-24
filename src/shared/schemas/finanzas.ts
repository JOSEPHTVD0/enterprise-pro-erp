import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'
import { formatosImpresion } from './ventas'

/** Esquemas compartidos de Fase 8. Todo importe se recibe en centavos enteros. */

const id = z.number().int().positive()
const texto = (max: number) => z.string().trim().max(max).default('')
const requerido = (max: number) => z.string().trim().min(1).max(max)
const centavos = z.number().int().nonnegative()
const positivos = z.number().int().positive()
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.')

export const metodosPagoFinanzas = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'] as const
export const metodoPagoFinanzas = z.enum(metodosPagoFinanzas)

export const tiposMovimientoBanco = [
  'DEPOSITO', 'RETIRO', 'TRANSFERENCIA', 'CHEQUE', 'CARGO', 'INTERES', 'AJUSTE'
] as const
export const tiposAnticipo = ['CLIENTE', 'PROVEEDOR'] as const
export const frecuenciasGasto = ['SEMANAL', 'MENSUAL', 'TRIMESTRAL', 'ANUAL'] as const

const filtroBase = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  entidadId: id.optional(),
  estado: z.string().trim().max(30).optional(),
  limite: z.number().int().min(1).max(1000).default(300)
})

export const finanzasFiltroSchema = conDefaultsDeObjetoVacio(filtroBase)
const movimientosBancoBase = filtroBase.extend({ cuentaId: id.optional() })
export const movimientosBancoFiltroSchema = conDefaultsDeObjetoVacio(movimientosBancoBase)
const sesionesCajaBase = filtroBase.extend({ cajaId: id.optional() })
export const sesionesCajaFiltroSchema = conDefaultsDeObjetoVacio(sesionesCajaBase)

export type FinanzasFiltro = z.infer<typeof finanzasFiltroSchema>
export type MovimientosBancoFiltro = z.infer<typeof movimientosBancoFiltroSchema>
export type SesionesCajaFiltro = z.infer<typeof sesionesCajaFiltroSchema>
export type FinanzasFiltroInput = Omit<FinanzasFiltro, 'limite'> & { limite?: number }
export type MovimientosBancoFiltroInput = Omit<MovimientosBancoFiltro, 'limite'> & { limite?: number }
export type SesionesCajaFiltroInput = Omit<SesionesCajaFiltro, 'limite'> & { limite?: number }

export const anularFinanzasSchema = z.object({
  id,
  motivo: z.string().trim().min(3, 'Indique el motivo de la anulación.').max(300)
})

/** Un recibo/pago puede compartir ID con un documento; el discriminator evita ambigüedad. */
export const referenciaFinanzasSchema = z.union([
  id,
  z.object({
    id,
    tipo: z.enum(['DOCUMENTO', 'RECIBO', 'PAGO']).default('DOCUMENTO')
  })
])
export type ReferenciaFinanzasInput = z.infer<typeof referenciaFinanzasSchema>

export const imprimirFinanzasSchema = z.object({
  id,
  formato: z.enum(formatosImpresion).default('CARTA'),
  tipo: z.enum(['DOCUMENTO', 'RECIBO', 'PAGO']).optional()
})

export const exportarFinanzasSchema = z.object({
  filtro: finanzasFiltroSchema.optional()
}).default({})

// ---------- CxC / CxP ----------

const aplicacionCxcSchema = z.object({
  cxcDocumentoId: id,
  montoCent: positivos
})

export const cxcReciboCrearSchema = z.object({
  clienteId: id,
  fecha: fecha.optional(),
  montoCent: positivos,
  metodo: metodoPagoFinanzas.default('EFECTIVO'),
  referencia: texto(80),
  cajaSesionId: id.optional(),
  bancoCuentaId: id.optional(),
  anticipoId: id.optional(),
  aplicaciones: z.array(aplicacionCxcSchema).min(1, 'Aplique el cobro a al menos una factura.'),
  comentarios: texto(300)
}).superRefine((value, ctx) => {
  const total = value.aplicaciones.reduce((suma, a) => suma + a.montoCent, 0)
  if (total !== value.montoCent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aplicaciones'],
      message: 'La suma de las aplicaciones debe igualar el monto del recibo.'
    })
  }
  if (!value.anticipoId) {
    if (value.metodo === 'EFECTIVO' && !value.cajaSesionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cajaSesionId'],
        message: 'El cobro en efectivo requiere una sesión de caja abierta.'
      })
    }
    if (value.metodo !== 'EFECTIVO' && !value.bancoCuentaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bancoCuentaId'],
        message: 'El cobro sin efectivo requiere una cuenta bancaria.'
      })
    }
  }
})

const aplicacionCxpSchema = z.object({
  cxpDocumentoId: id,
  montoCent: positivos
})

export const cxpPagoCrearSchema = z.object({
  proveedorId: id,
  fecha: fecha.optional(),
  montoCent: positivos,
  metodo: metodoPagoFinanzas.default('EFECTIVO'),
  referencia: texto(80),
  cajaSesionId: id.optional(),
  bancoCuentaId: id.optional(),
  anticipoId: id.optional(),
  aplicaciones: z.array(aplicacionCxpSchema).min(1, 'Aplique el pago a al menos una factura.'),
  comentarios: texto(300)
}).superRefine((value, ctx) => {
  const total = value.aplicaciones.reduce((suma, a) => suma + a.montoCent, 0)
  if (total !== value.montoCent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aplicaciones'],
      message: 'La suma de las aplicaciones debe igualar el monto del pago.'
    })
  }
  if (!value.anticipoId) {
    if (value.metodo === 'EFECTIVO' && !value.cajaSesionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cajaSesionId'],
        message: 'El pago en efectivo requiere una sesión de caja abierta.'
      })
    }
    if (value.metodo !== 'EFECTIVO' && !value.bancoCuentaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bancoCuentaId'],
        message: 'El pago sin efectivo requiere una cuenta bancaria.'
      })
    }
  }
})

export const anticipoCrearSchema = z.object({
  tipo: z.enum(tiposAnticipo),
  entidadId: id,
  fecha: fecha.optional(),
  montoCent: positivos,
  metodo: metodoPagoFinanzas.default('EFECTIVO'),
  referencia: texto(80),
  cajaSesionId: id.optional(),
  bancoCuentaId: id.optional()
}).superRefine((value, ctx) => {
  if (value.metodo === 'EFECTIVO' && !value.cajaSesionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cajaSesionId'],
      message: 'El anticipo en efectivo requiere una sesión de caja abierta.'
    })
  }
  if (value.metodo !== 'EFECTIVO' && !value.bancoCuentaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bancoCuentaId'],
      message: 'El anticipo sin efectivo requiere una cuenta bancaria.'
    })
  }
})

export type CxcReciboCrearInput = z.input<typeof cxcReciboCrearSchema>
export type CxpPagoCrearInput = z.input<typeof cxpPagoCrearSchema>
export type AnticipoCrearInput = z.input<typeof anticipoCrearSchema>
export type AnularFinanzasInput = z.infer<typeof anularFinanzasSchema>
export type ImprimirFinanzasInput = z.input<typeof imprimirFinanzasSchema>
export type ExportarFinanzasInput = z.input<typeof exportarFinanzasSchema>

// ---------- Bancos ----------

export const bancoCuentaSchema = z.object({
  codigo: requerido(20),
  nombre: requerido(80),
  banco: texto(80),
  numeroCuenta: texto(40),
  tipo: z.enum(['CORRIENTE', 'AHORROS', 'EFECTIVO']).default('CORRIENTE'),
  saldoInicialCent: centavos.default(0),
  activa: z.boolean().default(true)
})

export const bancoMovimientoSchema = z.object({
  cuentaId: id,
  fecha: fecha.optional(),
  tipo: z.enum(tiposMovimientoBanco),
  montoCent: z.number().int().refine((v) => v !== 0, 'El monto no puede ser cero.'),
  referencia: texto(80),
  docTipo: texto(40),
  docId: id.optional(),
  descripcion: texto(200)
})

export const bancoConciliacionSchema = z.object({
  cuentaId: id,
  fecha: fecha.optional(),
  periodoDesde: texto(20),
  periodoHasta: texto(20),
  saldoBancoCent: z.number().int(),
  observaciones: texto(300),
  movimientoIds: z.array(id).default([])
})

export type BancoCuentaInput = z.input<typeof bancoCuentaSchema>
export type BancoMovimientoInput = z.input<typeof bancoMovimientoSchema>
export type BancoConciliacionInput = z.input<typeof bancoConciliacionSchema>

// ---------- Caja ----------

export const abrirCajaFinanzasSchema = z.object({
  cajaId: id.optional(),
  montoCent: centavos.default(0),
  observaciones: texto(300)
})

export const cerrarCajaFinanzasSchema = z.object({
  sesionId: id,
  arqueoEfectivoCent: centavos,
  arqueoOtrosCent: centavos.default(0),
  observaciones: texto(300)
})

export const movimientoCajaManualSchema = z.object({
  sesionId: id,
  tipo: z.enum(['INGRESO', 'EGRESO']),
  metodo: metodoPagoFinanzas.default('EFECTIVO'),
  montoCent: positivos,
  descripcion: z.string().trim().min(3, 'Describa el movimiento.').max(200)
})

export type AbrirCajaFinanzasInput = z.input<typeof abrirCajaFinanzasSchema>
export type CerrarCajaFinanzasInput = z.input<typeof cerrarCajaFinanzasSchema>
export type MovimientoCajaManualInput = z.input<typeof movimientoCajaManualSchema>

// ---------- Gastos y comisiones ----------

export const gastoCategoriaSchema = z.object({
  codigo: requerido(20),
  nombre: requerido(80),
  activa: z.boolean().default(true)
})

export const gastoCrearSchema = z.object({
  categoriaId: id,
  proveedorId: id.optional(),
  fecha: fecha.optional(),
  concepto: z.string().trim().min(3, 'Indique el concepto del gasto.').max(200),
  montoCent: positivos,
  impuestoCent: centavos.default(0),
  metodo: z.enum(['EFECTIVO', 'BANCO']).default('EFECTIVO'),
  cajaSesionId: id.optional(),
  bancoCuentaId: id.optional(),
  docReferencia: texto(80),
  recurrenteId: id.optional()
}).superRefine((value, ctx) => {
  if (value.metodo === 'EFECTIVO' && !value.cajaSesionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cajaSesionId'],
      message: 'El gasto en efectivo requiere una sesión de caja abierta.'
    })
  }
  if (value.metodo === 'BANCO' && !value.bancoCuentaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bancoCuentaId'],
      message: 'El gasto bancario requiere una cuenta.'
    })
  }
})

export const gastoPagarSchema = z.object({
  id,
  metodo: z.enum(['EFECTIVO', 'BANCO']).default('EFECTIVO'),
  cajaSesionId: id.optional(),
  bancoCuentaId: id.optional(),
  referencia: texto(80)
}).superRefine((value, ctx) => {
  if (value.metodo === 'EFECTIVO' && !value.cajaSesionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cajaSesionId'],
      message: 'El pago en efectivo requiere una sesión de caja abierta.'
    })
  }
  if (value.metodo === 'BANCO' && !value.bancoCuentaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bancoCuentaId'],
      message: 'El pago bancario requiere una cuenta.'
    })
  }
})

export const gastoRecurrenteSchema = z.object({
  categoriaId: id,
  proveedorId: id.optional(),
  concepto: z.string().trim().min(3).max(200),
  montoCent: positivos,
  impuestoCent: centavos.default(0),
  frecuencia: z.enum(frecuenciasGasto).default('MENSUAL'),
  proximaFecha: fecha,
  activa: z.boolean().default(true)
})

export const comisionCrearSchema = z.object({
  vendedorId: id,
  docVentaId: id,
  baseCent: centavos,
  pctBp: z.number().int().min(0).max(10000),
  fecha: fecha.optional()
})

export const comisionPagarSchema = z.object({
  id,
  metodo: z.enum(['EFECTIVO', 'BANCO']).default('EFECTIVO'),
  cajaSesionId: id.optional(),
  bancoCuentaId: id.optional(),
  referencia: texto(80)
}).superRefine((value, ctx) => {
  if (value.metodo === 'EFECTIVO' && !value.cajaSesionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cajaSesionId'],
      message: 'El pago en efectivo requiere una sesión de caja abierta.'
    })
  }
  if (value.metodo === 'BANCO' && !value.bancoCuentaId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bancoCuentaId'],
      message: 'El pago bancario requiere una cuenta.'
    })
  }
})

export type GastoCategoriaInput = z.input<typeof gastoCategoriaSchema>
export type GastoCrearInput = z.input<typeof gastoCrearSchema>
export type GastoPagarInput = z.input<typeof gastoPagarSchema>
export type GastoRecurrenteInput = z.input<typeof gastoRecurrenteSchema>
export type ComisionCrearInput = z.input<typeof comisionCrearSchema>
export type ComisionPagarInput = z.input<typeof comisionPagarSchema>
