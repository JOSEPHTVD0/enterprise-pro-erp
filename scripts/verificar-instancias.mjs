import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const raiz = resolve(import.meta.dirname, '..')
const electronExe = (await import('electron')).default
const perfil = mkdtempSync(join(tmpdir(), 'erp-instancias-'))

function puertoLibre() {
  return new Promise((ok, error) => {
    const servidor = createServer()
    servidor.once('error', error)
    servidor.listen(0, '127.0.0.1', () => {
      const direccion = servidor.address()
      servidor.close(() => ok(typeof direccion === 'object' && direccion ? direccion.port : 0))
    })
  })
}

async function esperarPagina(puerto, nombre) {
  for (let intento = 0; intento < 120; intento += 1) {
    try {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`)
      if (respuesta.ok) {
        const objetivos = await respuesta.json()
        if (objetivos.some((objetivo) => objetivo.type === 'page')) return
      }
    } catch { /* CDP todavía no está listo */ }
    await new Promise((ok) => setTimeout(ok, 500))
  }
  throw new Error(`La instancia ${nombre} no expuso una ventana en CDP.`)
}

function asercion(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje)
}

const procesos = []
const navegadores = []
try {
  const puertos = [await puertoLibre(), await puertoLibre()]
  for (const puerto of puertos) {
    const proceso = spawn(electronExe, [
      raiz, `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`
    ], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] })
    proceso.stdout.on('data', (datos) => process.stdout.write(`[instancia ${puerto}] ${datos}`))
    proceso.stderr.on('data', (datos) => {
      const texto = String(datos)
      // Chromium comparte caché de GPU entre procesos con el mismo perfil; no afecta a la app.
      if (!/GPUPersistentCache|disk_cache|Gpu Cache/.test(texto)) {
        process.stderr.write(`[instancia ${puerto}] ${texto}`)
      }
    })
    procesos.push(proceso)
  }

  await Promise.all(puertos.map((puerto, indice) => esperarPagina(puerto, indice === 0 ? 'A' : 'B')))
  await new Promise((ok) => setTimeout(ok, 1500))

  asercion(
    procesos.every((proceso) => proceso.exitCode === null && proceso.signalCode === null),
    'Una instancia terminó: sigue existiendo un bloqueo de instancia única.'
  )

  const navegadoresPorPuerto = []
  for (const puerto of puertos) {
    const navegador = await chromium.connectOverCDP(`http://127.0.0.1:${puerto}`)
    navegadores.push(navegador)
    navegadoresPorPuerto.push(navegador)
  }

  const [primera, segunda] = navegadoresPorPuerto.map(
    (navegador) => navegador.contexts()[0]?.pages()[0]
  )
  asercion(!!primera && !!segunda, 'Una de las instancias no tiene una página.')

  // Primer arranque: la contraseña inicial debe cambiarse antes de entrar.
  await primera.getByLabel('Usuario').fill('admin')
  await primera.getByLabel('Contraseña', { exact: true }).fill('Admin1234!')
  await primera.getByRole('button', { name: 'Entrar al sistema' }).click()
  await primera.getByLabel('Contraseña actual').fill('Admin1234!')
  await primera.getByLabel('Nueva contraseña', { exact: true }).fill('5678')
  await primera.getByLabel('Confirmar nueva contraseña').fill('5678')
  await primera.getByRole('button', { name: 'Establecer contraseña' }).click()
  await primera.getByRole('navigation', { name: 'Módulos' }).waitFor({ timeout: 20_000 })

  await segunda.getByLabel('Usuario').fill('admin')
  await segunda.getByLabel('Contraseña', { exact: true }).fill('5678')
  await segunda.getByRole('button', { name: 'Entrar al sistema' }).click()
  await segunda.getByRole('navigation', { name: 'Módulos' }).waitFor({ timeout: 20_000 })

  // Entrar en la segunda instancia no debe cerrar la sesión de la primera.
  asercion(await primera.getByRole('navigation', { name: 'Módulos' }).isVisible(),
    'La segunda instancia cerró la sesión de la primera.')

  const lider = JSON.parse(readFileSync(join(perfil, 'instancia-lider.json'), 'utf-8'))
  asercion(procesos.some((proceso) => lider.id.startsWith(`${proceso.pid}-`)),
    'El líder no pertenece a ninguna de las instancias abiertas.')

  console.log('INSTANCIAS: dos procesos activos, misma BD, un solo líder y dos sesiones simultáneas.', {
    lider: lider.id, puertos
  })
} finally {
  for (const navegador of navegadores) await navegador.close().catch(() => undefined)
  for (const proceso of procesos) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proceso.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      proceso.kill('SIGTERM')
    }
  }
  await new Promise((ok) => setTimeout(ok, 1500))
  rmSync(perfil, { recursive: true, force: true })
}
