/** Tipos de presentación de Fase 7. El dinero viaja siempre en centavos enteros. */
export type Fila = Record<string, unknown>

export const txt = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor))
export const num = (valor: unknown): number => Number(valor ?? 0) || 0

export interface ProveedorOp {
  id: number
  codigo?: string
  nombreComercial?: string
  rnc?: string
  condicionPagoDias?: number
  balanceCent?: number
}

export interface ProductoOp {
  id: number
  codigo?: string
  descripcion: string
  impuestoId?: number | null
  tipo?: string
  manejaSerie: number | boolean
  manejaLote: number | boolean
  costoPromedioCent?: number
  costoUltimaCompraCent?: number
}

export interface ImpuestoOp {
  id: number
  codigo: string
  descripcion?: string
  tasaBp: number
  exento: number | boolean
}

export interface AlmacenOp { id: number; codigo?: string; nombre: string }

export interface CatalogosCompras {
  proveedores: ProveedorOp[]
  productos: ProductoOp[]
  almacenes: AlmacenOp[]
  impuestos: ImpuestoOp[]
  impuestoPorDefecto: string
}

export const catalogosVacios: CatalogosCompras = {
  proveedores: [], productos: [], almacenes: [], impuestos: [], impuestoPorDefecto: 'ITBIS18'
}

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'
export const metodosPago: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO']

export type TipoDocumentoCompra =
  | 'SOLICITUD_COMPRA' | 'ORDEN_COMPRA' | 'FACTURA_COMPRA' | 'DEVOLUCION_COMPRA'

export const etiquetasTipo: Record<string, string> = {
  SOLICITUD_COMPRA: 'Solicitud',
  ORDEN_COMPRA: 'Orden',
  RECEPCION: 'Recepción',
  FACTURA_COMPRA: 'Factura',
  DEVOLUCION_COMPRA: 'Devolución'
}

export interface LineaCompra {
  key: string
  productoId: string
  /** Presente al devolver: línea del documento de origen. */
  docLineaId?: string
  cantidad: string
  /** Costo en pesos para el campo de texto. */
  costo: string
  descuentoPct: string
  /** Gasto asociado en pesos; se capitaliza al costo y no se grava dos veces. */
  gasto: string
  impuestoId: string
  exento: boolean
  numeroSerie: string
  lote: string
}

export interface PagoCompraForm {
  key: string
  metodo: MetodoPago
  monto: string
  referencia: string
}

export interface FormularioCompra {
  tipo: TipoDocumentoCompra
  proveedorId: string
  almacenId: string
  fecha: string
  vencimiento: string
  numeroProveedor: string
  comentarios: string
  motivo: string
  docOrigenId: string
  credito: boolean
  lineas: LineaCompra[]
  pagos: PagoCompraForm[]
}

let contadorClave = 0
export function clave(): string {
  contadorClave += 1
  return `c${Date.now().toString(36)}${contadorClave}`
}

export function formularioVacio(
  catalogos: CatalogosCompras, tipo: TipoDocumentoCompra
): FormularioCompra {
  return {
    tipo,
    proveedorId: catalogos.proveedores[0] ? String(catalogos.proveedores[0].id) : '',
    almacenId: catalogos.almacenes[0] ? String(catalogos.almacenes[0].id) : '',
    fecha: new Date().toISOString().slice(0, 10),
    vencimiento: '', numeroProveedor: '', comentarios: '', motivo: '', docOrigenId: '',
    credito: false, lineas: [], pagos: []
  }
}

export interface DetalleCompra { cabecera: Fila; lineas: Fila[]; pagos: Fila[] }
export interface DatosImpresionCompra {
  formato: string
  empresa: Fila
  documento: Fila
  lineas: Fila[]
  pagos: Fila[]
}
