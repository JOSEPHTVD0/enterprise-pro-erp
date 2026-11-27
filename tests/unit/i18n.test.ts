import { describe, it, expect } from 'vitest'
import { texto } from '@/lib/i18n'

describe('textos del marco', () => {
  it('conserva el español como idioma por defecto', () => {
    expect(texto('buscarModulos')).toBe('Buscar módulos…')
    expect(texto('cerrarSesion')).toBe('Cerrar sesión')
    expect(texto('modoLocal')).toBe('Modo local · sin Internet')
  })

  it('traduce las etiquetas principales del shell', () => {
    expect(texto('buscarModulos', 'en')).toBe('Search modules…')
    expect(texto('cerrarSesion', 'en')).toBe('Sign out')
    expect(texto('actualizaciones', 'en')).toBe('Updates')
  })
})
