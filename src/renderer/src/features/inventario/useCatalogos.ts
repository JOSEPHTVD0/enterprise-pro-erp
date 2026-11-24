import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { errorInfo } from '@/app/session'
import type { AlmacenOp, ProductoOp } from './types'

/** Catálogos de inventario. El backend filtra por empresa y permisos. */
export function useCatalogos() {
  const [almacenes, setAlmacenes] = useState<AlmacenOp[]>([])
  const [productos, setProductos] = useState<ProductoOp[]>([])
  const [cargando, setCargando] = useState(true)

  const load = useCallback(async () => {
    setCargando(true)
    try {
      const res = await window.api.invoke<{ almacenes: AlmacenOp[]; productos: ProductoOp[] }>('inventario.catalogos')
      setAlmacenes(res.almacenes ?? [])
      setProductos(res.productos ?? [])
    } catch (e) {
      toast.error(errorInfo(e).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  return { almacenes, productos, cargando, reload: load }
}
