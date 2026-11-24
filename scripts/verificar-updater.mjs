import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '..')
const electronExe = (await import('electron')).default
const perfil = mkdtempSync(join(tmpdir(), 'erp-updater-'))
const feedDir = mkdtempSync(join(tmpdir(), 'erp-feed-'))

const paquete = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
const [mayor, menor, parche] = paquete.version.split('.').map(Number)
const versionFeed = `${mayor}.${menor}.${parche + 1}`

const dummy = Buffer.from('instalador de prueba para el feed')
writeFileSync(join(feedDir, 'actualizacion.exe'), dummy)
const hash = createHash('sha512').update(dummy).digest('base64')
writeFileSync(join(feedDir, 'latest.yml'), [
  `version: ${versionFeed}`,
  'files:',
  '  - url: actualizacion.exe',
  `    sha512: '${hash}'`,
  `    size: ${dummy.length}`,
  'path: actualizacion.exe',
  `sha512: '${hash}'`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n'))

const servidor = createServer((req, res) => {
  const nombre = (req.url ?? '').split('?')[0].replace(/^\/+/, '') || 'latest.yml'
  const archivo = join(feedDir, nombre)
  try {
    const datos = readFileSync(archivo)
    res.writeHead(200, { 'content-type': nombre.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream' })
    res.end(datos)
  } catch {
    res.writeHead(404)
    res.end('no encontrado')
  }
})
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
const puertoFeed = servidor.address().port

const puertoCdp = await new Promise((ok) => {
  const s = createTcpServer()
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port
    s.close(() => ok(p))
  })
})

const hijo = spawn(electronExe, [
  raiz, `--remote-debugging-port=${puertoCdp}`, `--user-data-dir=${perfil}`
], {
  cwd: raiz,
  env: { ...process.env, ERP_UPDATE_URL: `http://127.0.0.1:${puertoFeed}/` },
  stdio: ['ignore', 'pipe', 'pipe']
})
const salida = []
hijo.stdout.on('data', (d) => salida.push(String(d)))
hijo.stderr.on('data', (d) => salida.push(String(d)))

let navegador
try {
  let lista
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${puertoCdp}/json/list`)
      if (r.ok) {
        lista = await r.json()
        if (lista.some((t) => t.type === 'page')) break
      }
    } catch { /* esperando CDP */ }
    await new Promise((ok) => setTimeout(ok, 500))
  }
  if (!lista) throw new Error(`CDP no disponible: ${salida.join('').slice(0, 1000)}`)

  navegador = await chromium.connectOverCDP(`http://127.0.0.1:${puertoCdp}`)
  let pagina
  for (let i = 0; i < 40 && !pagina; i += 1) {
    pagina = navegador.contexts()[0].pages()[0]
    if (!pagina) await new Promise((ok) => setTimeout(ok, 250))
  }
  await pagina.waitForFunction(() => !!window.api, null, { timeout: 20000 })
  const resultado = await pagina.evaluate(async () =>
    await window.api.invoke('update.verificar'))
  console.log(JSON.stringify(resultado, null, 2))
  if (!resultado.disponible || resultado.version !== versionFeed) {
    throw new Error(`El actualizador no detectó ${versionFeed} desde el feed local.`)
  }
  console.log(`VERIFICADO: electron-updater detectó ${versionFeed} desde el feed local (versión instalada ${paquete.version}).`)
} finally {
  await navegador?.close().catch(() => undefined)
  hijo.kill()
  await new Promise((ok) => setTimeout(ok, 1500))
  servidor.close()
  rmSync(perfil, { recursive: true, force: true })
  rmSync(feedDir, { recursive: true, force: true })
}
