/** Servidor local solo para probar el feed de actualizaciones (127.0.0.1). */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

const raiz = resolve(import.meta.dirname, '..', 'release')
const puerto = Number(process.env['PORT'] ?? 8080)

if (!existsSync(raiz)) throw new Error('No existe release/. Ejecute `npm run release:feed` primero.')

const tipos = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream'
}

createServer((solicitud, respuesta) => {
  const nombre = decodeURIComponent((solicitud.url ?? '/').split('?')[0]).replace(/^\/+/, '') || 'latest.yml'
  const archivo = resolve(join(raiz, nombre))
  if (!archivo.startsWith(raiz + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) {
    respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    respuesta.end('No encontrado')
    return
  }
  respuesta.writeHead(200, {
    'content-type': tipos[extname(archivo).toLowerCase()] ?? 'application/octet-stream',
    'content-length': statSync(archivo).size,
    'cache-control': 'no-cache'
  })
  createReadStream(archivo).pipe(respuesta)
}).listen(puerto, '127.0.0.1', () => {
  console.log(`Feed de actualizaciones: http://127.0.0.1:${puerto}/latest.yml`)
  console.log('Ctrl+C para detener.')
})
