import { descargarArchivo } from '@/features/inventario/descargar'
import type { PdfGenerarInput } from '@shared/schemas/pdf'
import { normalizarFormato } from '@/lib/formato-impresion'

type SolicitudPdf = Omit<PdfGenerarInput, 'formato'> & { formato?: string }

/** Descarga un PDF generado en main con los mismos permisos que la impresión. */
export async function guardarPdf(solicitud: SolicitudPdf): Promise<void> {
  const input: PdfGenerarInput = {
    ...solicitud,
    formato: normalizarFormato(solicitud.formato)
  }
  const archivo = await window.api.invoke<{ filename: string; base64: string; mime: string }>(
    'pdf.generar', input
  )
  descargarArchivo(archivo.base64, archivo.filename, archivo.mime || 'application/pdf')
}
