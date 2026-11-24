import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { errorInfo } from '@/app/session'
import { catalogosVacios, type CatalogosVentas } from './types'

export type CanalCatalogos = 'ventas.catalogos' | 'pos.catalogos' | 'cotizaciones.catalogos'

/** Catálogos operativos de Fase 6. El backend filtra por empresa y permisos. */
export function useVentasCatalogos(canal: CanalCatalogos) {
  const [catalogos, setCatalogos] = useState<CatalogosVentas>(catalogosVacios)
  const [cargando, setCargando] = useState(true)

  const load = useCallback(async () => {
    setCargando(true)
    try {
      const res = await window.api.invoke<CatalogosVentas>(canal)
      setCatalogos({
        clientes: res.clientes ?? [],
        productos: res.productos ?? [],
        almacenes: res.almacenes ?? [],
        vendedores: res.vendedores ?? [],
        impuestos: res.impuestos ?? [],
        impuestoPorDefecto: res.impuestoPorDefecto ?? 'ITBIS18'
      })
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [canal])

  useEffect(() => { void load() }, [load])
  return { ...catalogos, cargando, reload: load }
}
