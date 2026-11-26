/*
 * Shim de compatibilidad para electron-builder 26 en Windows + Node 24.
 *
 * 1. `NsisTarget` ejecuta el stub del instalador con un entorno que solo contiene
 *    `__COMPAT_LAYER`. Sin `SystemRoot`, Node 24 devuelve `spawn UNKNOWN`. El shim
 *    fusiona ese entorno con el del proceso sin alterar ningún otro comportamiento.
 * 2. La directiva de Control de aplicaciones de Windows bloquea ejecutar el stub
 *    recién generado desde `descargas`. En lugar de ejecutarlo, se extrae el
 *    desinstalador incrustado con el propio `UninstallerReader` de electron-builder,
 *    que es exactamente lo que hace el stub. Así no se rompe ningún artefacto.
 *
 * Se carga con `NODE_OPTIONS=--require` desde scripts/dist-win.mjs.
 */
const childProcess = require('node:child_process')
const { basename, dirname, join } = require('node:path')

if (process.platform === 'win32') {
  const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil')
  const execFileOriginal = childProcess.execFile

  function esStubNsis(archivo, args) {
    return /EnterpriseProERP-Setup-.*\.exe$/i.test(String(archivo)) &&
      Array.isArray(args) && args.length === 0
  }

  childProcess.execFile = function execFileCompat(file, args, options, callback) {
    let opciones = options
    let retorno = callback
    if (typeof opciones === 'function') {
      retorno = opciones
      opciones = undefined
    }
    const cb = typeof retorno === 'function' ? retorno : () => {}

    if (esStubNsis(file, args)) {
      const instalador = String(file)
      const desinstalador = join(
        dirname(instalador),
        `${basename(instalador, 'exe')}__uninstaller.exe`
      )
      UninstallerReader.exec(instalador, desinstalador)
        .then(() => cb(null, '', ''))
        .catch((error) => cb(error, '', ''))
      return undefined
    }

    const entorno = {
      SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',
      ComSpec: process.env.ComSpec || 'C:\\WINDOWS\\system32\\cmd.exe',
      PATH: process.env.PATH || '',
      TEMP: process.env.TEMP || '',
      TMP: process.env.TMP || '',
      ...(opciones?.env ?? process.env)
    }
    opciones = opciones == null ? { env: entorno } : { ...opciones, env: entorno }

    try {
      return execFileOriginal.call(this, file, args, opciones, cb)
    } catch (error) {
      cb(error, '', '')
      return undefined
    }
  }
}
