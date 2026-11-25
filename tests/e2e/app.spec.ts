import { expect, test, chromium } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright-core'

/** El invocation de Electron desde Node devuelve la ruta al ejecutable. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const electronExe = require('electron') as string

let electron: ChildProcess
let browser: Browser
let page: Page
let perfil: string
let puerto = 0
const erroresConsola: string[] = []

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
        const objetivos = await respuesta.json() as { type: string; url: string }[]
        if (objetivos.some((objetivo) => objetivo.type === 'page')) return
      }
    } catch {
      // CDP todavía no está escuchando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Electron no expuso CDP a tiempo. ¿Se ejecutó `npm run build` antes de las E2E?')
}

test.beforeAll(async () => {
  puerto = await puertoLibre()
  perfil = mkdtempSync(join(tmpdir(), 'erp-e2e-'))
  electron = spawn(electronExe, [
    process.cwd(),
    `--remote-debugging-port=${puerto}`,
    `--user-data-dir=${perfil}`
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const salida: string[] = []
  electron.stdout?.on('data', (datos) => salida.push(String(datos)))
  electron.stderr?.on('data', (datos) => salida.push(String(datos)))

  try {
    await esperarCdp()
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`)
    const contexto = browser.contexts()[0]
    for (let intento = 0; intento < 40; intento += 1) {
      page = contexto.pages().find((candidata) => candidata.url().includes('index.html')) ?? contexto.pages()[0]
      if (page) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!page) throw new Error(`No se encontró la ventana del ERP. Salida: ${salida.join('').slice(0, 1500)}`)

    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error' && !mensaje.text().includes('UNAUTHORIZED')) {
        erroresConsola.push(mensaje.text())
      }
    })
    page.on('pageerror', (error) => erroresConsola.push(error.message))

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    await page.getByLabel('Usuario').fill('admin')
    await page.getByLabel('Contraseña', { exact: true }).fill('Admin1234!')
    await page.getByRole('button', { name: 'Entrar al sistema' }).click()

    // Primer arranque: la aplicación exige contraseña propia antes de entrar.
    await expect(page.getByLabel('Contraseña actual')).toBeVisible()
    await page.getByLabel('Contraseña actual').fill('Admin1234!')
    // Regresión: escribir tecla por tecla no debe perder el foco del campo.
    const nueva = page.getByLabel('Nueva contraseña', { exact: true })
    await nueva.pressSequentially('E2ePass2026!')
    await expect(nueva).toHaveValue('E2ePass2026!')
    const confirmar = page.getByLabel('Confirmar nueva contraseña')
    await confirmar.pressSequentially('E2ePass2026!')
    await expect(confirmar).toHaveValue('E2ePass2026!')
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

test('el ERP inicia, autentica y expone el menú real', async () => {
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible()
  await expect(page).toHaveTitle(/ENTERPRISE PRO ERP/)
})

test('pdf.generar produce un PDF real mediante IPC seguro', async () => {
  const archivo = await page.evaluate(async () => {
    const resultado = await window.api.invoke<{ filename: string; base64: string; mime: string }>(
      'pdf.generar', { origen: 'reporte', reporte: 'VENTAS' }
    )
    return {
      filename: resultado.filename,
      mime: resultado.mime,
      cabecera: atob(resultado.base64).slice(0, 5),
      bytes: resultado.base64.length
    }
  })
  expect(archivo.filename).toMatch(/\.pdf$/)
  expect(archivo.mime).toBe('application/pdf')
  expect(archivo.cabecera).toBe('%PDF-')
  expect(archivo.bytes).toBeGreaterThan(1000)
})

test('el botón PDF de reportes descarga el archivo desde la UI', async () => {
  await page.getByRole('button', { name: 'Reportes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
  // El resumen no tiene exportación; se selecciona un reporte real.
  await page.locator('main').getByRole('button', { name: 'Ventas', exact: true }).click()
  const botonPdf = page.getByRole('button', { name: 'PDF', exact: true })
  await expect(botonPdf).toBeVisible()
  await botonPdf.click()
  await expect(page.getByText('PDF del reporte descargado.')).toBeVisible()
})

test('el centro de control muestra permisos con descripción y ajustes auditables', async () => {
  await page.getByRole('button', { name: 'Centro de control', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Centro de control administrativo' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Para qué sirve' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes avanzados' }).click()
  await expect(page.getByText('Umbral de stock bajo')).toBeVisible()
})

test('inteligencia operativa consulta datos reales desde la UI', async () => {
  await page.getByRole('button', { name: 'Inteligencia operativa', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Inteligencia operativa' })).toBeVisible()
  await expect(page.getByText('Envejecimiento de CxC y CxP')).toBeVisible()
})

test('el buscador global filtra módulos sin romper la navegación', async () => {
  const buscador = page.getByRole('textbox', { name: 'Buscar módulos' })
  await expect(buscador).toBeVisible()
  await buscador.fill('centro de control')
  await expect(page.getByRole('button', { name: 'Centro de control', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reportes', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Centro de control', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Centro de control administrativo' })).toBeVisible()
  await expect(buscador).toHaveValue('')
})

test('los permisos personalizados se crean con descripción y auditoría', async () => {
  await page.getByRole('button', { name: 'Centro de control', exact: true }).click()
  await page.getByRole('button', { name: 'Permisos', exact: true }).click()
  await page.getByRole('button', { name: 'Crear permiso' }).click()

  const modal = page.getByRole('dialog', { name: 'Crear permiso personalizado' })
  await expect(modal).toBeVisible()
  await modal.getByRole('textbox').nth(0).fill('Prueba E2E')
  await modal.getByRole('textbox').nth(2).fill('Permite ver el panel de pruebas automatizadas del ERP.')
  await modal.getByRole('button', { name: 'Guardar permiso' }).click()

  await expect(page.getByText('Permiso personalizado guardado y auditado.')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Prueba E2E' }).last()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'custom.prueba_e2e' }).last()).toBeVisible()
})

test('sin errores de consola inesperados', async () => {
  expect(erroresConsola).toEqual([])
})
