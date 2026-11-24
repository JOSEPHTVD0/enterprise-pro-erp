import { useCallback, useEffect, useState } from 'react'
import { errorInfo } from '@/app/session'
import { toast } from '@/components/ui/Toast'
import { catalogosVacios, normalizarCatalogos, type CatalogosFinanzas, type Fila } from './types'

/** Catálogos operativos de Fase 8. El backend filtra por empresa y permisos. */
export function useFinanzasCatalogos() {
  const [catalogos, setCatalogos] = useState<CatalogosFinanzas>(catalogosVacios)
  const [cargando, setCargando] = useState(true)

  const load = useCallback(async () => {
    setCargando(true)
    try {
      const res = await window.api.invoke<CatalogosFinanzas>('finanzas.catalogos')
      setCatalogos(normalizarCatalogos(res))
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  return { ...catalogos, cargando, reload: load }
}

/**
 * Sesiones disponibles para seleccionar como contraparte de efectivo.
 * Si el usuario no tiene permiso de cajas, simplemente no hay opciones.
 */
export function useSesionesCaja(): Fila[] {
  const [sesiones, setSesiones] = useState<Fila[]>([])

  useEffect(() => {
    let activo = true
    window.api.invoke<Fila[]>('cajas.sesiones', { limite: 1000 })
      .then((res) => { if (activo) setSesiones(Array.isArray(res) ? res : []) })
      .catch(() => { if (activo) setSesiones([]) })
    return () => { activo = false }
  }, [])

  return sesiones
}
