export interface ProductoOp {
  id: number
  codigo: string
  descripcion: string
  manejaSerie: number
  manejaLote: number
  costoPromedioCent: number
}

export interface AlmacenOp {
  id: number
  codigo: string
  nombre: string
}

export type FilaInventario = Record<string, unknown> & { id: number }

export interface KardexFiltroUI {
  productoId?: number
  almacenId?: number
  tipo?: string
}

export function nombreProducto(productos: ProductoOp[], id: unknown): string {
  const p = productos.find((x) => x.id === Number(id))
  return p ? `${p.codigo} — ${p.descripcion}` : '—'
}

export function nombreAlmacen(almacenes: AlmacenOp[], id: unknown): string {
  return almacenes.find((a) => a.id === Number(id))?.nombre ?? '—'
}
