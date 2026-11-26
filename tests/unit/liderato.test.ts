import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { adquirirLiderInstancia } from '../../src/main/services/liderato.service'

const temporales: string[] = []

afterEach(async () => {
  await Promise.all(temporales.splice(0).map((ruta) => rm(ruta, { recursive: true, force: true })))
})

describe('liderato entre instancias', () => {
  it('solo una instancia es líder mientras el latido está fresco', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'erp-lider-'))
    temporales.push(dir)
    let ahora = 1_000_000
    const reloj = (): number => ahora

    const primero = adquirirLiderInstancia(dir, reloj)
    const segundo = adquirirLiderInstancia(dir, reloj)
    expect(primero.esLider).toBe(true)
    expect(segundo.esLider).toBe(false)

    ahora += 20_000
    expect(adquirirLiderInstancia(dir, reloj).esLider).toBe(false)
  })

  it('reclama el liderato cuando el latido expira y lo libera al detenerse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'erp-lider-'))
    temporales.push(dir)
    let ahora = 1_000_000
    const reloj = (): number => ahora

    const primero = adquirirLiderInstancia(dir, reloj)
    ahora += 60_000
    const segundo = adquirirLiderInstancia(dir, reloj)
    expect(segundo.esLider).toBe(true)

    segundo.detener()
    expect(adquirirLiderInstancia(dir, reloj).esLider).toBe(true)
    primero.detener()
  })
})
