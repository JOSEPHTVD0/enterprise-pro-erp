/** Descarga un archivo generado en main (base64) sin exponer rutas del sistema. */
export function descargarArchivo(
  base64: string,
  filename: string,
  mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
