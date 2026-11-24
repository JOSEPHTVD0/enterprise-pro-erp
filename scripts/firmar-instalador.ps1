<#
 Firma el instalador NSIS con un certificado AUTOFIRMADO (solo pruebas locales).
 No elimina SmartScreen: para eso se requiere un certificado de código de una CA pública.
#>
param(
  [string]$Password = $env:ERP_CERT_PASSWORD,
  [switch]$Regenerar
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $raiz 'build\certs'
$pfx = Join-Path $certDir 'enterprise-pro-erp-selfsigned.pfx'
$signtool = Join-Path $raiz 'node_modules\@electron\windows-sign\vendor\signtool.exe'

if (-not $Password) { $Password = 'EnterprisePro2026!' }

if (-not (Test-Path $signtool)) {
  throw "No se encontró signtool.exe en $signtool"
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if ($Regenerar -or -not (Test-Path $pfx)) {
  $cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject 'CN=Enterprise Pro ERP (autofirmado)' `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(3)
  $secure = ConvertTo-SecureString $Password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null
  Write-Host "Certificado autofirmado creado: $pfx"
}

$instalador = Get-ChildItem (Join-Path $raiz 'dist') -Filter 'EnterpriseProERP-Setup-*.exe' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $instalador) { throw 'No hay instalador en dist/. Ejecute npm run dist:win primero.' }

$argumentos = @('sign', '/f', $pfx, '/p', $Password, '/fd', 'sha256', $instalador.FullName)

# Timestamp opcional: si no hay Internet, la firma sigue siendo válida localmente.
try {
  & $signtool @argumentos /tr http://timestamp.digicert.com /td sha256 2>&1 | Write-Host
} catch {
  Write-Warning 'No se pudo añadir timestamp; se firma sin él.'
  & $signtool @argumentos 2>&1 | Write-Host
}

if ($LASTEXITCODE -ne 0) { throw "signtool terminó con código $LASTEXITCODE" }

$firma = Get-AuthenticodeSignature $instalador.FullName
Write-Host "Instalador firmado: $($instalador.FullName)"
Write-Host "Estado Authenticode: $($firma.Status)"
Write-Host "Huella SHA-1 del certificado: $($firma.SignerCertificate.Thumbprint)"
