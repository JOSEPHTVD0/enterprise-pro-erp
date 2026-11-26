import { describe, expect, it } from 'vitest'
import {
  HUELLA_FIRMA_INSTALADOR, verificarFirmaInstalador
} from '../../src/main/services/firma-instalador'

const firmaValida = JSON.stringify({
  Status: 1,
  StatusMessage: 'A certificate chain processed, but terminated in a root certificate which is not trusted by the trust provider.',
  SignerCertificate: {
    Subject: 'CN=Enterprise Pro ERP (autofirmado)',
    Thumbprint: HUELLA_FIRMA_INSTALADOR
  }
})

describe('verificación de firma del instalador', () => {
  it('acepta nuestro certificado autofirmado con huella fijada', async () => {
    const resultado = await verificarFirmaInstalador(
      ['Enterprise Pro ERP (autofirmado)'], 'C:\\Descargas\\setup.exe', async () => firmaValida
    )
    expect(resultado).toBeNull()
  })

  it('rechaza cualquier otra huella', async () => {
    const otra = firmaValida.replace(HUELLA_FIRMA_INSTALADOR, 'A'.repeat(40))
    const resultado = await verificarFirmaInstalador([], 'setup.exe', async () => otra)
    expect(resultado).toMatch(/Firma no reconocida/)
    expect(resultado).toContain(HUELLA_FIRMA_INSTALADOR)
  })

  it('rechaza un instalador sin firmar', async () => {
    const resultado = await verificarFirmaInstalador(
      [], 'setup.exe', async () => JSON.stringify({ Status: 2, SignerCertificate: null })
    )
    expect(resultado).toMatch(/sin certificado/)
  })

  it('falla cerrado si PowerShell no puede leer la firma', async () => {
    const resultado = await verificarFirmaInstalador([], 'setup.exe', async () => {
      throw new Error('powershell no disponible')
    })
    expect(resultado).toMatch(/No se pudo leer la firma/)
  })

  it('escape comillas simples en la ruta y consulta Get-AuthenticodeSignature', async () => {
    let comando = ''
    await verificarFirmaInstalador([], "C:\\O'Brien\\setup.exe", async (args) => {
      comando = args.join(' ')
      return firmaValida
    })
    expect(comando).toContain("Get-AuthenticodeSignature -LiteralPath 'C:\\O''Brien\\setup.exe'")
    expect(comando).toContain('ConvertTo-Json')
  })
})
