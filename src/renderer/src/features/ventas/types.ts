/** Tipos de presentación de la Fase 6. El dinero siempre viaja en centavos enteros. */
export type Fila = Record<string, unknown>

export const txt = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor))
export const num = (valor: unknown): number => Number(valor ?? 0) || 0

export interface ClienteOp {
  id: number
  codigo?: string
  nombre: string
  rncCedula?: string
  limiteCreditoCent?: number
  balanceCent?: number
  condicionPagoDias?: number
  vendedorId?: number | null
}

export interface ProductoOp {
  id: number
  codigo: string
  descripcion: string
  precio1Cent: number
  precioMinimoCent: number
  impuestoId?: number | null
  manejaSerie: number | boolean
  manejaLote: number | boolean
  tipo: string
}

export interface ImpuestoOp {
  id: number
  codigo: string
  descripcion: string
  tasaBp: number
  exento: number | boolean
}

export interface AlmacenOp { id: number; codigo: string; nombre: string }
export interface VendedorOp { id: number; codigo: string; nombre: string }

export interface CatalogosVentas {
  clientes: ClienteOp[]
  productos: ProductoOp[]
  almacenes: AlmacenOp[]
  vendedores: VendedorOp[]
  impuestos: ImpuestoOp[]
  impuestoPorDefecto: string
}

export const catalogosVacios: CatalogosVentas = {
  clientes: [], productos: [], almacenes: [], vendedores: [], impuestos: [], impuestoPorDefecto: 'ITBIS18'
}

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'
export const metodosPago: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO']

export interface LineaCarrito {
  key: string
  productoId: string
  cantidad: string
  /** Precio en pesos para el campo de texto; se convierte a centavos al enviar. */
  precioCent: string
  /** Porcentaje en pesos (p. ej. 10 = 10 %). */
  descuentoPct: string
  impuestoId: string
  exento: boolean
  numeroSerie: string
  lote: string
}

export interface PagoForm {
  key: string
  metodo: MetodoPago
  monto: string
  referencia: string
}

export interface FormularioVenta {
  clienteId: string
  almacenId: string
  vendedorId: string
  fecha: string
  vencimiento: string
  comentarios: string
  lineas: LineaCarrito[]
  pagos: PagoForm[]
}

export function formularioVacio(catalogos: CatalogosVentas): FormularioVenta {
  return {
    clienteId: '', almacenId: catalogos.almacenes[0] ? String(catalogos.almacenes[0].id) : '',
    vendedorId: '', fecha: new Date().toISOString().slice(0, 10), vencimiento: '',
    comentarios: '', lineas: [], pagos: []
  }
}

export let contadorClave = 0
export function clave(): string {
  contadorClave += 1
  return `k${Date.now().toString(36)}${contadorClave}`
}

export interface DetalleDocumento { cabecera: Fila; lineas: Fila[]; pagos: Fila[] }
export interface DatosImpresion {
  formato: string
  empresa: Fila
  documento: Fila
  lineas: Fila[]
  pagos: Fila[]
}
