import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registrarInstancia } from '../../src/main/services/instancias.service'

const temporales: string[] = []

afterEach(() => {
  while (temporales.length) rmSync(temporales.pop()!, { recursive: true, force: true })
})

describe('registro de instancias', () => {
  it('cuenta los procesos con latido fresco y descarta registros expirados', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erp-instancias-'))
    temporales.push(dir)
    let ahora = 1_000_000
    const reloj = (): number => ahora

    const primera = registrarInstancia(dir, reloj)
    expect(primera.activas()).toBe(1)
    const segunda = registrarInstancia(dir, reloj)
    expect(segunda.activas()).toBe(2)

    ahora += 60_000
    expect(primera.activas()).toBe(0)
    expect(segunda.activas()).toBe(0)

    primera.detener()
    segunda.detener()
  })

  it('deja de contarse al detenerse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erp-instancias-'))
    temporales.push(dir)
    const registro = registrarInstancia(dir)
    expect(registro.activas()).toBe(1)
    registro.detener()
    expect(registro.activas()).toBe(0)
  })
})
