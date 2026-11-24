/** Ejecuta electron-builder en Windows con el shim de compatibilidad de Node 24. */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '..')
const shim = resolve(raiz, 'scripts', 'compat-execfile.cjs')
// electron-builder reutiliza el directorio de salida y falla al renombrar
// electron.exe si el ejecutable anterior sigue presente (Windows).
rmSync(resolve(raiz, 'dist', 'win-unpacked'), {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 1000
})
const builder = resolve(raiz, 'node_modules', 'electron-builder', 'cli.js')
const nodeOptions = [process.env['NODE_OPTIONS'], `--require=${shim}`].filter(Boolean).join(' ')

const resultado = spawnSync(process.execPath, [builder, '--win', '--x64'], {
  cwd: raiz,
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  stdio: 'inherit'
})

process.exit(resultado.status ?? 1)
