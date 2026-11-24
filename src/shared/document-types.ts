export const documentTypes = [
  'FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS', 'COTIZACION', 'PEDIDO',
  'NOTA_CREDITO', 'NOTA_DEBITO', 'DEVOLUCION_VENTA', 'RECIBO_INGRESO', 'CONDUCE',
  'SOLICITUD_COMPRA', 'ORDEN_COMPRA', 'RECEPCION', 'FACTURA_COMPRA', 'DEVOLUCION_COMPRA'
] as const

export type DocumentType = (typeof documentTypes)[number]

export const documentTypeLabels: Record<DocumentType, string> = {
  FACTURA_CONTADO: 'Factura de contado', FACTURA_CREDITO: 'Factura a crédito',
  POS: 'Factura POS', COTIZACION: 'Cotización', PEDIDO: 'Pedido',
  NOTA_CREDITO: 'Nota de crédito', NOTA_DEBITO: 'Nota de débito',
  DEVOLUCION_VENTA: 'Devolución de venta', RECIBO_INGRESO: 'Recibo de ingreso',
  CONDUCE: 'Conduce', SOLICITUD_COMPRA: 'Solicitud de compra',
  ORDEN_COMPRA: 'Orden de compra', RECEPCION: 'Recepción de mercancía',
  FACTURA_COMPRA: 'Factura de compra', DEVOLUCION_COMPRA: 'Devolución de compra'
}
