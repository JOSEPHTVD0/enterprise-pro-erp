/** Tipos de presentación de Fase 9. El backend sigue enviando dinero en centavos. */

export type ReporteKey =
  | 'RESUMEN' | 'VENTAS' | 'COMPRAS' | 'INVENTARIO'
  | 'CXC' | 'CXP' | 'LIBRO606' | 'LIBRO607'

export interface ReporteDef {
  id: ReporteKey
  label: string
  descripcion: string
}

export const reportesDisponibles: ReporteDef[] = [
  { id: 'RESUMEN', label: 'Resumen', descripcion: 'Indicadores y evolución de períodos.' },
  { id: 'VENTAS', label: 'Ventas', descripcion: 'Documentos de venta y totales.' },
  { id: 'COMPRAS', label: 'Compras', descripcion: 'Documentos de compra y totales.' },
  { id: 'INVENTARIO', label: 'Inventario', descripcion: 'Existencias por producto y almacén.' },
  { id: 'CXC', label: 'CxC', descripcion: 'Saldos por cobrar y antigüedad.' },
  { id: 'CXP', label: 'CxP', descripcion: 'Saldos por pagar y antigüedad.' },
  { id: 'LIBRO606', label: 'Libro 606', descripcion: 'Borrador local de compras.' },
  { id: 'LIBRO607', label: 'Libro 607', descripcion: 'Borrador local de ventas.' }
]

export const tiposVenta = [
  'FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS',
  'NOTA_CREDITO', 'NOTA_DEBITO', 'DEVOLUCION_VENTA'
]
export const tiposCompra = ['FACTURA_COMPRA', 'DEVOLUCION_COMPRA']

export type FilaReporte = Record<string, string | number>

export interface ColumnaReporte {
  key: string
  header: string
  width?: number
}

export interface DatosReporte {
  titulo: string
  columnas: ColumnaReporte[]
  filas: FilaReporte[]
  totales: Record<string, number>
  registros: number
}

export interface Indicadores {
  moneda: 'DOP'
  ventasHoyCent: number
  ventasMesCent: number
  comprasMesCent: number
  cxcSaldoCent: number
  cxpSaldoCent: number
  productosAgotados: number
  gananciaMesCent: number | null
  cajaAbierta: {
    id: number
    cajaId: number
    fechaApertura: string
    fondoCent: number
  } | null
}

export interface PuntoSerie {
  clave: string
  ventasCent: number
  comprasCent: number
  cobrosCent: number
  pagosCent: number
}

export interface Serie {
  desde: string
  hasta: string
  granularidad: 'DIA' | 'MES'
  puntos: PuntoSerie[]
}

export interface DatosImpresionReporte {
  reporte: ReporteKey
  titulo: string
  empresa: Record<string, unknown>
  generadoEn: string
  filtro: Record<string, unknown>
  columnas: ColumnaReporte[]
  filas: FilaReporte[]
  totales: Record<string, number>
  registros: number
  aviso: string
}

export interface ArchivoReporte {
  filename: string
  base64: string
  mime: string
}

export function num(valor: unknown): number {
  const resultado = Number(valor)
  return Number.isFinite(resultado) ? resultado : 0
}

export function txt(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor)
}
