import { useCallback } from 'react'
import { useAppStore } from '@/app/store'

/**
 * Traducciones del marco de la aplicación. El contenido de negocio sigue en
 * español porque proviene de la base de datos; aquí solo se traducen etiquetas
 * del shell que la estación puede cambiar desde Ajustes avanzados.
 */
const textos = {
  es: {
    buscarModulos: 'Buscar módulos…',
    buscarModulosAria: 'Buscar módulos',
    modulos: 'Módulos',
    sesionActiva: 'Sesión activa',
    cambiarContrasena: 'Cambiar contraseña',
    cerrarSesion: 'Cerrar sesión',
    actualizaciones: 'Actualizaciones',
    acercaDe: 'Acerca de',
    modoLocal: 'Modo local · sin Internet',
    fechaLocal: 'Fecha local'
  },
  en: {
    buscarModulos: 'Search modules…',
    buscarModulosAria: 'Search modules',
    modulos: 'Modules',
    sesionActiva: 'Active session',
    cambiarContrasena: 'Change password',
    cerrarSesion: 'Sign out',
    actualizaciones: 'Updates',
    acercaDe: 'About',
    modoLocal: 'Local mode · offline',
    fechaLocal: 'Local date'
  }
} as const

export type IdiomaInterfaz = keyof typeof textos
export type ClaveTexto = keyof typeof textos.es

export function texto(clave: ClaveTexto, idioma: IdiomaInterfaz = 'es'): string {
  return textos[idioma][clave]
}

/** Hook del idioma persistido en la estación (validado por Zod). */
export function useTexto(): (clave: ClaveTexto) => string {
  const idioma = useAppStore((s) => s.settings.interfaz.idioma)
  return useCallback((clave: ClaveTexto) => texto(clave, idioma), [idioma])
}
