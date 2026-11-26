import { describe, it, expect } from 'vitest'
import { normalizarAjustesEfectivos } from '../../src/renderer/src/app/ajustes-store'
import { normalizarTemaAvanzado } from '../../src/renderer/src/lib/tema-avanzado'
import { defaultAjustes } from '@shared/schemas/ajustes'

describe('recuperación de perfil sucio tras el acceso', () => {
  it('rellena grupos parciales con defaults en lugar de dejar el shell vacío', () => {
    const ajustes = normalizarAjustesEfectivos({
      interfaz: { tituloApp: 'EMPRESA CARGADA' } as never,
      tema: { escala: 0, colorAcento: 'INVALIDO' } as never
    })

    expect(ajustes.interfaz.tituloApp).toBe('EMPRESA CARGADA')
    expect(ajustes.interfaz.ocultarElementos).toEqual(defaultAjustes.interfaz.ocultarElementos)
    expect(ajustes.interfaz.ordenGrupos).toEqual(defaultAjustes.interfaz.ordenGrupos)
    expect(ajustes.interfaz.etiquetasModulo).toEqual(defaultAjustes.interfaz.etiquetasModulo)
    expect(ajustes.tema).toEqual(defaultAjustes.tema)
  })

  it('descarta por completo un grupo corrupto sin afectar a los demás', () => {
    const ajustes = normalizarAjustesEfectivos({
      interfaz: { ordenGrupos: undefined } as never,
      widgets: { filas: 7 } as never
    })

    expect(ajustes.interfaz).toEqual(defaultAjustes.interfaz)
    expect(ajustes.widgets.filas).toBe(7)
  })

  it('normaliza escala, acento y fuente antes de escribir variables CSS', () => {
    expect(normalizarTemaAvanzado()).toEqual(defaultAjustes.tema)
    expect(normalizarTemaAvanzado({ escala: 2, radio: 'RARO' } as never).escala).toBe(1.3)
    expect(normalizarTemaAvanzado({ escala: Number.NaN } as never).escala).toBe(1)
    expect(normalizarTemaAvanzado({ escala: 0.1 } as never).escala).toBe(0.8)
    expect(normalizarTemaAvanzado({ colorAcento: 'INVALIDO', fuente: 'RARO' } as never)).toMatchObject({
      colorAcento: defaultAjustes.tema.colorAcento,
      fuente: defaultAjustes.tema.fuente
    })
  })
})
