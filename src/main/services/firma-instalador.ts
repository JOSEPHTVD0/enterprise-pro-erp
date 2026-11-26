import { execFile } from 'node:child_process'

/**
 * Huella del certificado autofirmado con el que se firman los instaladores.
 * Se fija explícitamente: el actualizador debe aceptar esta identidad concreta
 * aunque Windows no confíe en su raíz (`Get-AuthenticodeSignature` = Status 1).
 */
export const HUELLA_FIRMA_INSTALADOR = '60B08EC13A4D8B0B5039A1F9698994D55312CD0C'

const ASUNTO_FIRMA_INSTALADOR = 'CN=Enterprise Pro ERP (autofirmado)'

export type EjecutarPowershell = (argumentos: string[]) => Promise<string>

function ejecutarPowershell(argumentos: string[]): Promise<string> {
  return new Promise((resolver, rechazar) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', ...argumentos],
      { windowsHide: true, timeout: 20_000 },
      (error, stdout, stderr) => {
        if (error) rechazar(new Error(stderr.trim() || error.message))
        else resolver(stdout)
      }
    )
  })
}

function normalizarHuella(valor: unknown): string {
  return typeof valor === 'string' ? valor.replace(/[^a-fA-F0-9]/g, '').toUpperCase() : ''
}

interface DatosFirma {
  SignerCertificate?: { Subject?: unknown; Thumbprint?: unknown } | null
}

/**
 * Verificación propia para `electron-updater`. Comprueba la identidad del
 * firmante, no la cadena de confianza de Windows: el SHA-512 de `latest.yml`
 * ya garantiza que los bytes descargados son los publicados.
 *
 * Cualquier otro certificado se rechaza. El mensaje devuelto se usa tal cual en
 * el error `ERR_UPDATER_INVALID_SIGNATURE` del actualizador.
 */
export async function verificarFirmaInstalador(
  _nombresPublicador: string[],
  rutaInstalador: string,
  ejecutar: EjecutarPowershell = ejecutarPowershell
): Promise<string | null> {
  const rutaEscapada = rutaInstalador.replace(/'/g, "''")
  // Solo se serializan dos campos ASCII: evita depender de la code page de
  // Windows para mensajes localizados como `StatusMessage`.
  const comando = [
    `$firma = Get-AuthenticodeSignature -LiteralPath '${rutaEscapada}' -ErrorAction Stop`,
    '$firma.SignerCertificate | Select-Object Subject, Thumbprint | ConvertTo-Json -Compress'
  ].join('; ')

  let datos: DatosFirma
  try {
    const salida = await ejecutar([comando])
    datos = JSON.parse(salida) as DatosFirma
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    return `No se pudo leer la firma del instalador: ${detalle}`
  }

  const certificado = datos.SignerCertificate
  const huella = normalizarHuella(certificado?.Thumbprint)
  const asunto = typeof certificado?.Subject === 'string' ? certificado.Subject : ''

  if (huella !== HUELLA_FIRMA_INSTALADOR || asunto !== ASUNTO_FIRMA_INSTALADOR) {
    return `Firma no reconocida. Se esperaba ${ASUNTO_FIRMA_INSTALADOR} (${HUELLA_FIRMA_INSTALADOR}); ` +
      `se encontró ${asunto || 'sin certificado'} (${huella || 'sin huella'}).`
  }

  return null
}
