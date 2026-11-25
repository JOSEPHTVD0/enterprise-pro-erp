/*
 * Shim de compatibilidad para electron-builder 26 en Windows + Node 24.
 *
 * `NsisTarget` ejecuta el stub del desinstalador con un entorno que solo contiene
 * `__COMPAT_LAYER`. Sin `SystemRoot`, Node 24 devuelve `spawn UNKNOWN`. Este shim
 * fusiona ese entorno con el del proceso sin alterar ningún otro comportamiento.
 * Se carga con `NODE_OPTIONS=--require` desde scripts/dist-win.mjs.
 */
const childProcess = require('node:child_process')

if (process.platform === 'win32') {
  const execFileOriginal = childProcess.execFile
  childProcess.execFile = function execFileCompat(file, args, options, callback) {
    let opciones = options
    let retorno = callback
    if (typeof opciones === 'function') {
      retorno = opciones
      opciones = undefined
    }
    // Algunas rutas de electron-builder pasan `env` con una sola variable y otras
    // no pasan `env`. En Windows ambas necesitan las variables del sistema para
    // que Node 24 no devuelva `spawn UNKNOWN`.
    const entorno = {
      SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',
      ComSpec: process.env.ComSpec || 'C:\\WINDOWS\\system32\\cmd.exe',
      PATH: process.env.PATH || '',
      TEMP: process.env.TEMP || '',
      TMP: process.env.TMP || '',
      ...(opciones?.env ?? process.env)
    }
    opciones = opciones == null ? { env: entorno } : { ...opciones, env: entorno }
    return execFileOriginal.call(this, file, args, opciones, retorno)
  }
}
