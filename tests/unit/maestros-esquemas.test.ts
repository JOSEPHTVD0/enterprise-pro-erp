import { describe, it, expect } from 'vitest'
import { parseMaestro } from '@shared/maestros'

describe('esquemas compartidos de maestros', () => {
  it('acepta un alta mínima y aplica los valores por defecto', () => {
    const parsed = parseMaestro('clientes', { codigo: 'CLI-1', nombre: 'Cliente Mínimo' })
    expect(parsed).toMatchObject({
      codigo: 'CLI-1', nombre: 'Cliente Mínimo', tipo: 'EMPRESA',
      email: '', activo: true, limiteCreditoCent: 0, condicionPagoDias: 0
    })
  })

  it('rechaza claves foráneas con valores no numéricos', () => {
    expect(() => parseMaestro('clientes', {
      codigo: 'CLI-2', nombre: 'Cliente', listaPrecioId: Number.NaN
    })).toThrow()
  })

  it('valida el correo cuando se proporciona', () => {
    expect(() => parseMaestro('clientes', {
      codigo: 'CLI-3', nombre: 'Cliente', email: 'correo-invalido'
    })).toThrow()
  })
})
