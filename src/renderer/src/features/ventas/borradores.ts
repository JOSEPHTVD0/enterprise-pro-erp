import { formularioVacio, txt, type CatalogosVentas, type FormularioVenta } from './types'

/**
 * Borradores locales de facturación. No son documentos emitidos: no reservan
 * NCF, no afectan inventario ni CxC y nunca se envían al backend hasta que el
 * usuario confirma la emisión con `ventas.factura.crear`.
 */
export interface BorradorFactura {
  id: string
  numero: string
  tipo: 'FACTURA_CONTADO' | 'FACTURA_CREDITO'
  actualizadoEn: string
  form: FormularioVenta
}

const CLAVE = 'erp-borradores-facturacion-v1'

function esBorrador(valor: unknown): valor is BorradorFactura {
  if (!valor || typeof valor !== 'object') return false
  const b = valor as Partial<BorradorFactura>
  return typeof b.id === 'string' && typeof b.numero === 'string' &&
    (b.tipo === 'FACTURA_CONTADO' || b.tipo === 'FACTURA_CREDITO') &&
    typeof b.actualizadoEn === 'string' && !!b.form &&
    typeof b.form === 'object' && Array.isArray(b.form.lineas)
}

export function listarBorradores(): BorradorFactura[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE)
    if (!crudo) return []
    const datos: unknown = JSON.parse(crudo)
    return Array.isArray(datos) ? datos.filter(esBorrador) : []
  } catch {
    return []
  }
}

function persistir(borradores: BorradorFactura[]): void {
  window.localStorage.setItem(CLAVE, JSON.stringify(borradores))
}

export function guardarBorradorLocal(
  tipo: BorradorFactura['tipo'], form: FormularioVenta, id?: string
): BorradorFactura {
  const actuales = listarBorradores()
  const existente = id ? actuales.find((b) => b.id === id) : undefined
  const nuevo: BorradorFactura = {
    id: existente?.id ?? `BOR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    numero: existente?.numero ?? `BORRADOR-${String(actuales.length + 1).padStart(4, '0')}`,
    tipo,
    actualizadoEn: new Date().toISOString(),
    form: JSON.parse(JSON.stringify(form)) as FormularioVenta
  }
  persistir(existente ? actuales.map((b) => (b.id === id ? nuevo : b)) : [nuevo, ...actuales])
  return nuevo
}

export function eliminarBorradorLocal(id: string): void {
  persistir(listarBorradores().filter((b) => b.id !== id))
}

/** Reconstruye un formulario editable con los catálogos vigentes. */
export function formularioDeBorrador(
  borrador: BorradorFactura, catalogos: CatalogosVentas
): FormularioVenta {
  const base = formularioVacio(catalogos)
  return {
    ...base,
    ...borrador.form,
    lineas: borrador.form.lineas.map((linea) => ({ ...linea })),
    comentarios: txt(borrador.form.comentarios)
  }
}
