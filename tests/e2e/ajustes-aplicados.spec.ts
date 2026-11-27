import { expect, test, chromium } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright-core'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const electronExe = require('electron') as string

let electron: ChildProcess
let browser: Browser
let page: Page
let perfil: string
let puerto = 0

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer()
    servidor.once('error', reject)
    servidor.listen(0, '127.0.0.1', () => {
      const direccion = servidor.address()
      servidor.close(() => resolve(typeof direccion === 'object' && direccion ? direccion.port : 0))
    })
  })
}

async function esperarCdp(): Promise<void> {
  for (let intento = 0; intento < 120; intento += 1) {
    try {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`)
      if (respuesta.ok) {
        const objetivos = await respuesta.json() as { type: string }[]
        if (objetivos.some((objetivo) => objetivo.type === 'page')) return
      }
    } catch {
      // CDP todavía no está escuchando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Electron no expuso CDP a tiempo.')
}

test.beforeAll(async () => {
  puerto = await puertoLibre()
  perfil = mkdtempSync(join(tmpdir(), 'erp-ajustes-e2e-'))
  electron = spawn(electronExe, [
    process.cwd(),
    `--remote-debugging-port=${puerto}`,
    `--user-data-dir=${perfil}`
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  try {
    await esperarCdp()
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`)
    const contexto = browser.contexts()[0]
    for (let intento = 0; intento < 40; intento += 1) {
      page = contexto.pages().find((candidata) => candidata.url().includes('index.html')) ?? contexto.pages()[0]
      if (page) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!page) throw new Error('No se encontró la ventana del ERP.')

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    await page.getByLabel('Usuario').fill('admin')
    await page.getByLabel('Contraseña', { exact: true }).fill('Admin1234!')
    await page.getByRole('button', { name: 'Entrar al sistema' }).click()
    await expect(page.getByLabel('Contraseña actual')).toBeVisible()
    await page.getByLabel('Contraseña actual').fill('Admin1234!')
    const nueva = page.getByLabel('Nueva contraseña', { exact: true })
    await nueva.pressSequentially('4821')
    await expect(nueva).toHaveValue('4821')
    const confirmar = page.getByLabel('Confirmar nueva contraseña')
    await confirmar.pressSequentially('4821')
    await expect(confirmar).toHaveValue('4821')
    await page.getByRole('button', { name: 'Establecer contraseña' }).click()
    await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible()
  } catch (error) {
    electron.kill()
    throw error
  }
})

test.afterAll(async () => {
  await browser?.close().catch(() => undefined)
  if (electron && !electron.killed) electron.kill()
  await Promise.race([
    new Promise<void>((resolve) => electron?.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5000))
  ])
  if (perfil) rmSync(perfil, { recursive: true, force: true })
})

test('los ajustes guardados cambian aviso, umbral y comparación en la interfaz', async () => {
  await page.evaluate(async () => {
    const efectivos = await window.api.invoke<Record<string, Record<string, unknown>>>('config.ajustes.efectivos')
    await Promise.all([
      window.api.invoke('config.ajustes.save', {
        grupo: 'seguridad',
        datos: {
          ocultarCostosEnListados: false,
          confirmarAnulaciones: true,
          mascararRnc: false,
          avisoAntesDeBloqueoMin: 9
        }
      }),
      window.api.invoke('config.ajustes.save', {
        grupo: 'alertas',
        datos: { ...(efectivos.alertas ?? {}), stockBajoUmbral: 99 }
      }),
      window.api.invoke('config.ajustes.save', {
        grupo: 'panel2026',
        datos: { ...(efectivos.panel2026 ?? {}), compararPeriodo: true }
      })
    ])
    window.dispatchEvent(new Event('erp:preferencias-actualizadas'))
  })

  await expect(page.locator('footer')).toContainText('Aviso 9 min')
  await expect(page.locator('footer [data-aviso-min]')).toHaveAttribute('data-aviso-min', '9')

  const menu = page.getByRole('navigation', { name: 'Módulos' })
  await menu.getByRole('button', { name: 'Panel de stock', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Panel de control de stock' })).toBeVisible()
  await expect(page.getByText('Umbral administrativo: 99')).toBeVisible()

  await menu.getByRole('button', { name: 'Panel operativo 2026', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Panel operativo 2026' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Comparación con período anterior' })).toBeVisible()
  await expect(page.getByText(/Ventas|Cobros|no disponible en esta vista/).first()).toBeVisible()
})

test('el enlace DGI se configura como rotulado visual y no como emisión', async () => {
  await page.evaluate(async () => {
    const efectivos = await window.api.invoke<Record<string, Record<string, unknown>>>('config.ajustes.efectivos')
    await window.api.invoke('config.ajustes.save', {
      grupo: 'dgiEnlace',
      datos: {
        ...(efectivos.dgiEnlace ?? {}),
        mostrarPanel: true,
        estadoVisual: 'EN_PREPARACION',
        ambienteVisual: 'PRUEBAS',
        notaInformativa: 'Solo visual: sin envío a DGII ni emisión e-CF.'
      }
    })
    window.dispatchEvent(new Event('erp:preferencias-actualizadas'))
  })

  const menu = page.getByRole('navigation', { name: 'Módulos' })
  await menu.getByRole('button', { name: 'Centro de control', exact: true }).click()
  await page.getByRole('button', { name: 'Ajustes avanzados' }).click()
  await page.getByRole('button', { name: 'Enlace DGI' }).click()
  await expect(page.getByText('Estado visual del enlace')).toBeVisible()
  await expect(page.getByText('No cambia el entorno real; no hay emisión e-CF.')).toBeVisible()

  await menu.getByRole('button', { name: 'Facturación', exact: true }).last().click()
  await expect(page.locator('[data-dgi-estado="EN_PREPARACION"]')).toBeVisible()
  await expect(page.getByText('EN_PREPARACION · PRUEBAS')).toBeVisible()
})
