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
    const minimo =
      options != null &&
      options.env != null &&
      Object.keys(options.env).length === 1 &&
      Object.prototype.hasOwnProperty.call(options.env, '__COMPAT_LAYER')
    const opciones = minimo
      ? { ...options, env: { ...process.env, ...options.env } }
      : options
    return execFileOriginal.call(this, file, args, opciones, callback)
  }
}
