/** Genera un feed `latest.yml` compatible con electron-updater (proveedor generic). */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '..')
const paquete = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
const version = process.argv[2]?.replace(/^--version=/, '') || paquete.version
const destino = join(raiz, 'release')

mkdirSync(destino, { recursive: true })
const instaladores = readdirSync(join(raiz, 'dist'))
  .filter((nombre) => /^EnterpriseProERP-Setup-.*\.exe$/i.test(nombre))
  .sort((a, b) => statSync(join(raiz, 'dist', b)).mtimeMs - statSync(join(raiz, 'dist', a)).mtimeMs)

if (!instaladores.length) throw new Error('No hay instalador en dist/. Ejecute primero `npm run dist:win`.')

const instalador = instaladores[0]
const origen = join(raiz, 'dist', instalador)
const destinoInstalador = join(destino, instalador)
if (resolve(origen) !== resolve(destinoInstalador)) copyFileSync(origen, destinoInstalador)

const bytes = readFileSync(destinoInstalador)
const hash = createHash('sha512').update(bytes).digest('base64')
const yaml = [
  `version: ${version}`,
  'files:',
  `  - url: ${instalador}`,
  `    sha512: '${hash}'`,
  `    size: ${bytes.length}`,
  `path: ${instalador}`,
  `sha512: '${hash}'`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n')

const archivoFeed = join(destino, 'latest.yml')
writeFileSync(archivoFeed, yaml, 'utf8')
console.log(`Feed generado: ${archivoFeed}`)
console.log(`Instalador: ${instalador} (${bytes.length} bytes)`)
console.log(`URL pública configurada: ${paquete.build.publish.url}`)
