/** Tipos de presentación de Fase 8. El dinero viaja siempre en centavos enteros. */
import { centavosDesdeDecimal } from '@shared/dinero'

export type Fila = Record<string, unknown>

export const txt = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor))
export const num = (valor: unknown): number => Number(valor ?? 0) || 0

/** Un campo editable guarda pesos como texto; al enviar al backend se convierte a centavos. */
export const centavos = (valor: string | number): number => centavosDesdeDecimal(Number(valor) || 0)
export const pesos = (centavosValor: number): string => (num(centavosValor) / 100).toFixed(2)
export const hoy = (): string => new Date().toISOString().slice(0, 10)

export function numOp(valor: string): number | undefined {
  const texto = txt(valor).trim()
  if (!texto) return undefined
  const n = Number(texto)
  return Number.isFinite(n) ? n : undefined
}

export function textoOp(valor: string): string | undefined {
  const texto = txt(valor).trim()
  return texto || undefined
}

let contadorClave = 0
export function clave(): string {
  contadorClave += 1
  return `f${Date.now().toString(36)}${contadorClave}`
}

/** Catálogos operativos de Fase 8. El backend filtra por empresa y permisos. */
export interface CatalogosFinanzas {
  clientes: Fila[]
  proveedores: Fila[]
  vendedores: Fila[]
  cajas: Fila[]
  bancosCuentas: Fila[]
  gastoCategorias: Fila[]
  metodosPago: Fila[]
  formatosImpresion: Fila[]
}

export const catalogosVacios: CatalogosFinanzas = {
  clientes: [], proveedores: [], vendedores: [], cajas: [], bancosCuentas: [],
  gastoCategorias: [], metodosPago: [], formatosImpresion: []
}

function aFilas(valor: unknown): Fila[] {
  if (Array.isArray(valor)) {
    return valor
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number') {
          return { codigo: String(item), nombre: String(item) }
        }
        return item && typeof item === 'object' ? (item as Fila) : {}
      })
      .filter((f) => Object.keys(f).length > 0)
  }
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).map(([codigo, nombre]) => ({ codigo, nombre }))
  }
  return []
}

/** Normaliza los catálogos para tolerar listas de cadenas u objetos. */
export function normalizarCatalogos(res: unknown): CatalogosFinanzas {
  const raw = (res ?? {}) as Fila
  return {
    clientes: aFilas(raw.clientes),
    proveedores: aFilas(raw.proveedores),
    vendedores: aFilas(raw.vendedores),
    cajas: aFilas(raw.cajas),
    bancosCuentas: aFilas(raw.bancosCuentas),
    gastoCategorias: aFilas(raw.gastoCategorias),
    metodosPago: aFilas(raw.metodosPago),
    formatosImpresion: aFilas(raw.formatosImpresion)
  }
}

export function etiquetaFila(fila: Fila): string {
  return txt(fila.nombreComercial) || txt(fila.nombre) || txt(fila.descripcion) ||
    txt(fila.razonSocial) || txt(fila.codigo) || (num(fila.id) ? String(num(fila.id)) : '—')
}

export function opciones(items: Fila[], todo = 'Todos'): { value: string; label: string }[] {
  return [
    { value: '', label: todo },
    ...items.map((item) => ({ value: String(num(item.id)), label: etiquetaFila(item) }))
  ]
}

export const estadosFinanzas = [
  'PENDIENTE', 'PARCIAL', 'APLICADO', 'PAGADO', 'COMPLETO', 'CONCILIADO', 'ANULADO'
]

export const metodosPorDefecto = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO']
export const formatosPorDefecto = ['CARTA', 'MEDIA', 'TICKET_80', 'TICKET_58']

function codigos(items: Fila[], porDefecto: string[]): string[] {
  const resultado = items
    .map((item) => txt(item.codigo) || txt(item.nombre) || txt(item.metodo) || txt(item.formato))
    .filter(Boolean)
  return resultado.length ? resultado : porDefecto
}

export const metodosDe = (catalogos: CatalogosFinanzas): string[] => codigos(catalogos.metodosPago, metodosPorDefecto)
export const formatosDe = (catalogos: CatalogosFinanzas): string[] => codigos(catalogos.formatosImpresion, formatosPorDefecto)

/** Filtro genérico de listados; los extras se envían solo en los canales que los aceptan. */
export interface FiltroFinanzas {
  desde: string
  hasta: string
  entidadId: string
  estado: string
  limite: string
  cuentaId: string
  cajaId: string
}

export const filtroVacio = (): FiltroFinanzas => ({
  desde: '', hasta: '', entidadId: '', estado: '', limite: '1000', cuentaId: '', cajaId: ''
})

export function payloadFiltro(filtro: FiltroFinanzas, extras: string[] = []): Record<string, unknown> {
  const salida: Record<string, unknown> = { limite: num(filtro.limite) || 1000 }
  if (filtro.desde) salida.desde = filtro.desde
  if (filtro.hasta) salida.hasta = filtro.hasta
  if (filtro.entidadId) salida.entidadId = num(filtro.entidadId)
  if (filtro.estado) salida.estado = filtro.estado
  if (extras.includes('cuentaId') && filtro.cuentaId) salida.cuentaId = num(filtro.cuentaId)
  if (extras.includes('cajaId') && filtro.cajaId) salida.cajaId = num(filtro.cajaId)
  return salida
}

/** El saldo puede llegar con distintos nombres según el documento; se normaliza aquí. */
export function pendienteCent(fila: Fila): number {
  for (const claveSaldo of ['saldoPendienteCent', 'pendienteCent', 'saldoCent', 'porCobrarCent', 'porPagarCent']) {
    if (fila[claveSaldo] !== undefined && fila[claveSaldo] !== null) return num(fila[claveSaldo])
  }
  const total = num(fila.totalCent) || num(fila.montoCent)
  const abonado = num(fila.abonadoCent) || num(fila.pagadoCent) || num(fila.aplicadoCent) || num(fila.abonoCent)
  return total - abonado
}

export function esAnulado(fila: Fila): boolean {
  return txt(fila.estado).toUpperCase() === 'ANULADO' || fila.anulado === true || num(fila.anulado) === 1
}

export function medioPagoValido(formulario: {
  metodo: string; cajaSesionId: string; bancoCuentaId: string; anticipoId?: string
}): boolean {
  if (formulario.anticipoId) return true
  return formulario.metodo === 'EFECTIVO' ? Boolean(formulario.cajaSesionId) : Boolean(formulario.bancoCuentaId)
}

export const mensajeMedioPago = 'Seleccione la sesión de caja (efectivo) o la cuenta bancaria del medio de pago.'

export interface AplicacionForm {
  key: string
  documentoId: string
  monto: string
}

/** Recibo de CxC o pago de CxP: la misma captura, distinto canal y entidad. */
export interface FormularioCobroPago {
  entidadId: string
  monto: string
  metodo: string
  referencia: string
  cajaSesionId: string
  bancoCuentaId: string
  anticipoId: string
  aplicaciones: AplicacionForm[]
  comentarios: string
  fecha: string
}

export function cobroPagoVacio(entidades: Fila[], entidadId = ''): FormularioCobroPago {
  return {
    entidadId: entidadId || (entidades[0] ? String(num(entidades[0].id)) : ''),
    monto: '', metodo: 'EFECTIVO', referencia: '', cajaSesionId: '', bancoCuentaId: '',
    anticipoId: '', aplicaciones: [{ key: clave(), documentoId: '', monto: '' }],
    comentarios: '', fecha: hoy()
  }
}

export interface FormularioAnticipo {
  tipo: 'CLIENTE' | 'PROVEEDOR'
  entidadId: string
  monto: string
  metodo: string
  referencia: string
  cajaSesionId: string
  bancoCuentaId: string
  fecha: string
}

export function anticipoVacio(tipo: 'CLIENTE' | 'PROVEEDOR', entidades: Fila[]): FormularioAnticipo {
  return {
    tipo,
    entidadId: entidades[0] ? String(num(entidades[0].id)) : '',
    monto: '', metodo: 'EFECTIVO', referencia: '', cajaSesionId: '', bancoCuentaId: '', fecha: hoy()
  }
}

export interface FormularioCuenta {
  codigo: string
  nombre: string
  banco: string
  numeroCuenta: string
  tipo: string
  saldoInicial: string
  activa: boolean
}

export const cuentaVacia = (): FormularioCuenta => ({
  codigo: '', nombre: '', banco: '', numeroCuenta: '', tipo: '', saldoInicial: '0.00', activa: true
})

export type TipoMovimientoBanco =
  | 'DEPOSITO' | 'RETIRO' | 'TRANSFERENCIA' | 'CHEQUE' | 'CARGO' | 'INTERES' | 'AJUSTE'

export const tiposMovimientoBanco: TipoMovimientoBanco[] = [
  'DEPOSITO', 'RETIRO', 'TRANSFERENCIA', 'CHEQUE', 'CARGO', 'INTERES', 'AJUSTE'
]

export interface FormularioMovimientoBanco {
  cuentaId: string
  fecha: string
  tipo: TipoMovimientoBanco
  monto: string
  referencia: string
  docTipo: string
  docId: string
  descripcion: string
}

export function movimientoBancoVacio(cuentas: Fila[], cuentaId = ''): FormularioMovimientoBanco {
  return {
    cuentaId: cuentaId || (cuentas[0] ? String(num(cuentas[0].id)) : ''),
    fecha: hoy(), tipo: 'DEPOSITO', monto: '', referencia: '', docTipo: '', docId: '', descripcion: ''
  }
}

export interface FormularioConciliacion {
  cuentaId: string
  fecha: string
  periodoDesde: string
  periodoHasta: string
  saldoBanco: string
  observaciones: string
  movimientoIds: number[]
}

export function conciliacionVacia(cuentas: Fila[], cuentaId = ''): FormularioConciliacion {
  return {
    cuentaId: cuentaId || (cuentas[0] ? String(num(cuentas[0].id)) : ''),
    fecha: hoy(), periodoDesde: '', periodoHasta: '', saldoBanco: '', observaciones: '', movimientoIds: []
  }
}

export interface FormularioApertura {
  cajaId: string
  monto: string
  observaciones: string
}

export function aperturaVacia(cajas: Fila[]): FormularioApertura {
  return { cajaId: cajas[0] ? String(num(cajas[0].id)) : '', monto: '0.00', observaciones: '' }
}

export interface FormularioCierre {
  sesionId: number
  referencia: string
  arqueoEfectivo: string
  arqueoOtros: string
  observaciones: string
}

export function cierreVacio(sesionId: number, referencia: string): FormularioCierre {
  return { sesionId, referencia, arqueoEfectivo: '', arqueoOtros: '0.00', observaciones: '' }
}

export interface FormularioMovimientoCaja {
  sesionId: string
  tipo: 'INGRESO' | 'EGRESO'
  metodo: string
  monto: string
  descripcion: string
}

export function movimientoCajaVacio(sesiones: Fila[], sesionId = ''): FormularioMovimientoCaja {
  return {
    sesionId: sesionId || (sesiones[0] ? String(num(sesiones[0].id)) : ''),
    tipo: 'INGRESO', metodo: 'EFECTIVO', monto: '', descripcion: ''
  }
}

export interface FormularioGasto {
  categoriaId: string
  proveedorId: string
  fecha: string
  concepto: string
  monto: string
  impuesto: string
  metodo: 'EFECTIVO' | 'BANCO'
  cajaSesionId: string
  bancoCuentaId: string
  docReferencia: string
  recurrenteId: string
}

export function gastoVacio(categorias: Fila[], proveedores: Fila[]): FormularioGasto {
  return {
    categoriaId: categorias[0] ? String(num(categorias[0].id)) : '',
    proveedorId: proveedores[0] ? String(num(proveedores[0].id)) : '',
    fecha: hoy(), concepto: '', monto: '', impuesto: '0.00',
    metodo: 'EFECTIVO', cajaSesionId: '', bancoCuentaId: '', docReferencia: '', recurrenteId: ''
  }
}

export interface FormularioCategoria {
  codigo: string
  nombre: string
  activa: boolean
}

export const categoriaVacia = (): FormularioCategoria => ({ codigo: '', nombre: '', activa: true })

export type FrecuenciaRecurrente = 'SEMANAL' | 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL'
export const frecuenciasRecurrentes: FrecuenciaRecurrente[] = ['SEMANAL', 'MENSUAL', 'TRIMESTRAL', 'ANUAL']

export interface FormularioRecurrente {
  categoriaId: string
  proveedorId: string
  concepto: string
  monto: string
  impuesto: string
  frecuencia: FrecuenciaRecurrente
  proximaFecha: string
  activa: boolean
}

export function recurrenteVacio(categorias: Fila[], proveedores: Fila[]): FormularioRecurrente {
  return {
    categoriaId: categorias[0] ? String(num(categorias[0].id)) : '',
    proveedorId: proveedores[0] ? String(num(proveedores[0].id)) : '',
    concepto: '', monto: '', impuesto: '0.00',
    frecuencia: 'MENSUAL', proximaFecha: hoy(), activa: true
  }
}

export interface FormularioComision {
  vendedorId: string
  docVentaId: string
  base: string
  pctBp: string
  fecha: string
}

export function comisionVacia(vendedores: Fila[]): FormularioComision {
  return {
    vendedorId: vendedores[0] ? String(num(vendedores[0].id)) : '',
    docVentaId: '', base: '', pctBp: '1000', fecha: hoy()
  }
}

export interface FormularioPago {
  id: number
  metodo: string
  cajaSesionId: string
  bancoCuentaId: string
  referencia: string
}

export function pagoVacio(id: number): FormularioPago {
  return { id, metodo: 'EFECTIVO', cajaSesionId: '', bancoCuentaId: '', referencia: '' }
}

/** Detalle common a CxC/CxP (aplicaciones, recibos/pagos) y al resto de módulos (movimientos). */
export interface DetalleFinanzas {
  cabecera: Fila
  aplicaciones?: Fila[]
  movimientos?: Fila[]
  recibos?: Fila[]
  pagos?: Fila[]
}

export interface DatosImpresionFinanzas {
  formato: string
  empresa: Fila
  documento: Fila
  lineas: Fila[]
}
