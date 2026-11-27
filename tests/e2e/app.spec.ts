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
    // Política 0.5.2+: se acepta un PIN numérico de 4 dígitos.
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

test('el ERP inicia, autentica y expone el menú real', async () => {
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible()
  await expect(page).toHaveTitle(/ENTERPRISE PRO ERP/)
})

test('app:reload recarga la interfaz y permite volver a entrar', async () => {
  await page.evaluate(async () => { await window.api.invoke('app:reload') })
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña', { exact: true }).fill('4821')
  await page.getByRole('button', { name: 'Entrar al sistema' }).click()
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible()
})

test('las actualizaciones se gestionan desde un panel del programa', async () => {
  await page.getByRole('button', { name: 'Actualizaciones', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Actualizaciones de ENTERPRISE PRO ERP' })
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('Busque y descargue el instalador en Descargas.')
  await expect(modal.getByRole('button', { name: /Buscar/ })).toBeVisible()
  await expect(modal).not.toContainText('Instalar y reiniciar')
  await modal.getByRole('button', { name: 'Cerrar' }).last().click()
  await expect(modal).toHaveCount(0)
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

test('Ventas y Cobros son áreas separadas en el menú', async () => {
  const menu = page.getByRole('navigation', { name: 'Módulos' })
  await expect(menu.getByRole('button', { name: 'Cobros', exact: true }).last()).toBeVisible()
  await menu.getByRole('button', { name: 'Cobros', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Cobros' })).toBeVisible()
  await expect(page.getByText('independiente de Ventas')).toBeVisible()
  await expect(page.getByText('Número / referencia')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportar cartera' })).toBeVisible()
})

test('Facturación edita borradores locales y muestra el enlace DGI solo visual', async () => {
  const menu = page.getByRole('navigation', { name: 'Módulos' })
  await menu.getByRole('button', { name: 'Facturación', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Facturación', exact: true })).toBeVisible()
  await expect(page.getByText('Enlace DGI · visual')).toBeVisible()
  await expect(page.locator('[title*="sin envío a DGII"]')).toBeVisible()
  await page.getByRole('button', { name: /Borradores/ }).click()
  await expect(page.getByText('Borradores locales')).toBeVisible()
  await expect(page.getByText('no reservan NCF')).toBeVisible()
})

test('el panel comercial unifica ventas, facturación y cobros con filtros', async () => {
  const menu = page.getByRole('navigation', { name: 'Módulos' })
  await menu.getByRole('button', { name: 'Panel comercial', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Panel comercial' })).toBeVisible()
  await expect(page.getByText('Búsqueda filtrada unificada')).toBeVisible()
  await expect(page.getByText('Número').first()).toBeVisible()
  await expect(page.getByText('Monto mínimo')).toBeVisible()
  await expect(page.getByText('Concentración por cliente')).toBeVisible()
  await expect(page.getByText(/No hay envío ni emisión e-CF/)).toBeVisible()
})

test('la interfaz y las capas por rol/permiso se configuran desde el centro de control', async () => {
  await page.getByRole('button', { name: 'Centro de control', exact: true }).click()
  await page.getByRole('button', { name: 'Interfaz', exact: true }).click()
  await expect(page.getByText('Título de la aplicación')).toBeVisible()
  await expect(page.getByText('Orden de los grupos del menú')).toBeVisible()

  await page.getByRole('button', { name: 'Por rol / permiso' }).click()
  await page.getByRole('button', { name: 'Nueva capa' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva capa de personalización' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Solo grupos visuales')).toBeVisible()
  await modal.getByRole('button', { name: 'Cancelar' }).click()
})

test('la auditoría filtra por registro y por contenido de los cambios', async () => {
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Auditoría', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Auditoría y control' })).toBeVisible()
  await page.getByPlaceholder('Ej. 42').fill('1')
  await page.getByPlaceholder('Ej. cliente, RNC…').fill('ERP')
  await expect(page.getByText('Historial de operaciones')).toBeVisible()
})

test('la agenda de vencimientos filtra cobros y pagos con escritura continua', async () => {
  await page.getByRole('navigation', { name: 'Módulos' })
    .getByRole('button', { name: 'Agenda de vencimientos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Agenda de vencimientos' })).toBeVisible()
  await page.getByPlaceholder('Ej. FAC-00000012').pressSequentially('FAC-')
  await expect(page.getByPlaceholder('Ej. FAC-00000012')).toHaveValue('FAC-')
  await expect(page.getByRole('heading', { name: 'Cuentas por cobrar' })).toBeVisible()
})

test('el panel de stock filtra existencias y respeta permisos de costo', async () => {
  await page.getByRole('navigation', { name: 'Módulos' })
    .getByRole('button', { name: 'Panel de stock', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Panel de control de stock' })).toBeVisible()
  await page.getByPlaceholder('Ej. ACEITE, A-01…').pressSequentially('A-')
  await expect(page.getByPlaceholder('Ej. ACEITE, A-01…')).toHaveValue('A-')
  await expect(page.getByText('Existencias por producto')).toBeVisible()
})

test('las plantillas rápidas aplican ajustes visuales auditados', async () => {
  await page.getByRole('button', { name: 'Centro de control', exact: true }).click()
  await page.getByRole('button', { name: 'Interfaz', exact: true }).click()
  await expect(page.getByText('Plantillas rápidas')).toBeVisible()
  await page.getByRole('button', { name: /Compacto/ }).click()
  await expect(page.getByText('Plantilla «Compacto» aplicada y auditada.')).toBeVisible()
})

test('la paleta global Ctrl+K abre módulos permitidos', async () => {
  await page.keyboard.press('Control+k')
  const paleta = page.getByRole('textbox', { name: 'Buscar en todo el ERP' })
  await expect(paleta).toBeVisible()
  await paleta.fill('cobros')
  await expect(page.getByRole('button', { name: /Cobros/ }).first()).toBeVisible()
  await paleta.press('Escape')
  await expect(paleta).toHaveCount(0)
})

test('el centro de tareas muestra el estado real sin tareas inventadas', async () => {
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Inicio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
  await expect(page.getByText('Centro de tareas')).toBeVisible()
})

test('los favoritos organizan el menú sin perder navegación', async () => {
  const menu = page.getByRole('navigation', { name: 'Módulos' })
  await menu.getByRole('button', { name: 'Agregar favorito: Auditoría' }).click()
  await expect(menu.getByRole('region', { name: 'Favoritos' })).toBeVisible()
  await menu.getByRole('button', { name: 'Quitar favorito: Auditoría' }).first().click()
  await expect(menu.getByRole('region', { name: 'Favoritos' })).toHaveCount(0)
})

test('los filtros avanzados y las vistas guardadas admiten escritura continua', async () => {
  await page.getByRole('navigation', { name: 'Módulos' })
    .getByRole('button', { name: 'Auditoría', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Auditoría y control' })).toBeVisible()

  await page.getByRole('button', { name: 'Filtros avanzados' }).click()
  await page.getByRole('button', { name: 'Agregar condición' }).click()
  const valor = page.getByLabel('Valor de la condición 1')
  await valor.pressSequentially('ERP')
  await expect(valor).toHaveValue('ERP')
  await expect(page.getByText('«ERP»')).toBeVisible()

  const nombre = page.getByLabel('Nombre de la vista')
  await nombre.pressSequentially('Prueba E2E')
  await expect(nombre).toHaveValue('Prueba E2E')
  await page.getByRole('button', { name: 'Guardar vista' }).click()
  await expect(page.getByRole('button', { name: 'Aplicar vista Prueba E2E' })).toBeVisible()
})

test('el panel operativo 2026 consulta datos reales y respeta ajustes', async () => {
  await page.getByRole('navigation', { name: 'Módulos' })
    .getByRole('button', { name: 'Panel operativo 2026', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Panel operativo 2026' })).toBeVisible()
  await expect(page.getByText('Proyección de efectivo')).toBeVisible()
  await expect(page.getByText('Umbrales aplicados', { exact: false })).toBeVisible()
})

test('el mapa de capacidades 2026 muestra el alcance real', async () => {
  await page.getByRole('navigation', { name: 'Módulos' })
    .getByRole('button', { name: 'Mapa de capacidades 2026', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mapa de capacidades 2026' })).toBeVisible()
  await expect(page.getByText('Módulos activos', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Ej. cobros, stock, CRM…').fill('Panel operativo 2026')
  await expect(page.getByRole('cell', { name: 'Panel operativo 2026' })).toBeVisible()
})

test('el espacio de trabajo muestra panel, herramientas y personalización reales', async () => {
  await page.getByRole('navigation', { name: 'Módulos' })
    .getByRole('button', { name: 'Espacio de trabajo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Espacio de trabajo' })).toBeVisible()
  await expect(page.getByText('Visualización de la operación')).toBeVisible()
  await page.getByRole('button', { name: 'Herramientas', exact: true }).click()
  await expect(page.getByText('Herramientas de mantenimiento')).toBeVisible()
  await page.getByRole('button', { name: 'Personalización', exact: true }).click()
  await expect(page.getByText('Personalización de la estación')).toBeVisible()
})

test('el árbol de React sigue presente tras autenticar y navegar', async () => {
  const hijos = await page.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)
  expect(hijos).toBeGreaterThan(0)
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible()
})

test('un perfil con ajustes parciales no deja la interfaz en negro', async () => {
  // Se siembra una fila heredada con un solo campo del grupo `interfaz`, como
  // aparece en perfiles migrados. El backend debe completarla y el renderer
  // debe seguir dibujando el shell aunque la capa llegue incompleta.
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const db = new Database(join(perfil, 'data', 'enterprise.db'))
  db.prepare(`
    INSERT INTO ajustes (empresa_id, grupo, datos_json, usuario_id)
    VALUES (1, 'interfaz', ?, 1)
    ON CONFLICT(empresa_id, grupo) DO UPDATE SET datos_json = excluded.datos_json
  `).run(JSON.stringify({ tituloApp: 'PRUEBA SUCIA' }))
  db.close()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña', { exact: true }).fill('4821')
  await page.getByRole('button', { name: 'Entrar al sistema' }).click()

  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible()
  await expect(page.getByText('PRUEBA SUCIA')).toBeVisible()
  const hijos = await page.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)
  expect(hijos).toBeGreaterThan(0)
})

test('sin errores de consola inesperados', async () => {
  expect(erroresConsola).toEqual([])
})
