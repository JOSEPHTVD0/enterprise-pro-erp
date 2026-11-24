import { useCallback, useEffect, useState } from 'react'
import { errorInfo } from '@/app/session'
import { toast } from '@/components/ui/Toast'
import { catalogosVacios, type CatalogosCompras } from './types'

/** Catálogos operativos de Fase 7. El backend filtra por empresa y permisos. */
export function useComprasCatalogos() {
  const [catalogos, setCatalogos] = useState<CatalogosCompras>(catalogosVacios)
  const [cargando, setCargando] = useState(true)

  const load = useCallback(async () => {
    setCargando(true)
    try {
      const res = await window.api.invoke<CatalogosCompras>('compras.catalogos')
      setCatalogos({
        proveedores: res.proveedores ?? [],
        productos: res.productos ?? [],
        almacenes: res.almacenes ?? [],
        impuestos: res.impuestos ?? [],
        impuestoPorDefecto: res.impuestoPorDefecto ?? 'ITBIS18'
      })
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  return { ...catalogos, cargando, reload: load }
}
