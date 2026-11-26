import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  definicionDocumento, generarPdf, mmAPuntos, preferenciasImpresionPdf,
  procesarExportacionesAutomaticas, resolverCarpetaExportacion, type FuentesPdf
} from '../../src/main/services/pdf.service'
import type { SessionContext } from '../../src/main/services/context'
import { testDb } from '../helpers/db'
import { createAuthService } from '../../src/main/services/auth.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { defaultAjustes } from '@shared/schemas/ajustes'

const temporales: string[] = []
const userDataTemporal = (): string => {
  const ruta = mkdtempSync(join(tmpdir(), 'erp-pdf-'))
  temporales.push(ruta)
  return ruta
}
afterEach(() => {
  while (temporales.length) rmSync(temporales.pop()!, { recursive: true, force: true })
})

function contextoReal(db: ReturnType<typeof testDb>): SessionContext {
  return createAuthService(db).login(
    { username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-PDF'
  ).context as SessionContext
}

const ctx = {} as SessionContext

const datosDocumento = {
  empresa: {
    nombreComercial: 'Enterprise Pro', razonSocial: 'Enterprise Pro SRL',
    rnc: '123456789', direccion: 'Santo Domingo'
  },
  documento: {
    tipo: 'FACTURA', numero: 'A-0001', fecha: '2026-11-24', estado: 'ACTIVO',
    clienteNombre: 'Cliente Prueba', subtotalCent: 100000, impuestoCent: 18000, totalCent: 118000
  },
  lineas: [
    { descripcion: 'Servicio', cantidad: 2, precioCent: 50000, impuestoCent: 18000, totalCent: 118000 }
  ],
  pagos: [{ metodo: 'EFECTIVO', montoCent: 118000 }]
}

function fuentes(overrides: Partial<FuentesPdf> = {}): FuentesPdf {
  const imprimir = vi.fn(() => datosDocumento)
  return {
    ventas: { datosImpresion: imprimir as never },
    compras: { datosImpresion: imprimir as never },
    finanzas: {
      cxcImprimir: imprimir as never,
      cxpImprimir: imprimir as never,
      bancosImprimir: imprimir as never,
      cajasImprimir: imprimir as never
    },
    cobros: { imprimir: imprimir as never },
    reportes: { imprimir: imprimir as never },
    ...overrides
  }
}

const esPdf = (base64: string) => Buffer.from(base64, 'base64').subarray(0, 5).toString() === '%PDF-'

describe('PDF nativo con pdfmake', () => {
  it('genera un PDF válido para un documento de venta', async () => {
    const archivo = await generarPdf(ctx, { origen: 'venta', id: 1, formato: 'CARTA' }, fuentes())
    expect(archivo.mime).toBe('application/pdf')
    expect(archivo.filename).toMatch(/^FACTURA_\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(esPdf(archivo.base64)).toBe(true)
  })

  it('genera un ticket en origen POS sin alterar los datos', async () => {
    const archivo = await generarPdf(ctx, { origen: 'venta', id: 1, formato: 'TICKET_80' }, fuentes())
    expect(esPdf(archivo.base64)).toBe(true)
  })

  it('valida el filtro del reporte con el esquema compartido', async () => {
    const imprimir = vi.fn(() => ({
      titulo: 'Ventas', empresa: {}, generadoEn: '2026-11-24T00:00:00.000Z',
      filtro: {}, columnas: [{ key: 'numero', header: 'Número' }],
      filas: [{ numero: 'A-0001' }], totales: { totalCent: 118000 },
      registros: 1, aviso: 'Datos reales.'
    }))
    const archivo = await generarPdf(ctx, {
      origen: 'reporte', reporte: 'VENTAS', formato: 'CARTA'
    }, fuentes({ reportes: { imprimir: imprimir as never } }))
    expect(esPdf(archivo.base64)).toBe(true)
    expect(imprimir).toHaveBeenCalledWith(ctx, expect.objectContaining({
      reporte: 'VENTAS', filtro: expect.objectContaining({ limite: 300 })
    }))
  })

  it('propaga el error de permisos del servicio de origen', async () => {
    const sinPermiso = () => { throw new Error('SIN_PERMISO: ventas.imprimir') }
    await expect(generarPdf(ctx, { origen: 'venta', id: 1, formato: 'CARTA' }, fuentes({
      ventas: { datosImpresion: sinPermiso as never }
    }))).rejects.toThrow('SIN_PERMISO')
  })
})

describe('settings.impresion y ajustes.integraciones en el PDF', () => {
  it('aplica incluirLogo, incluirPie, copias y margenMm', () => {
    const definicion = definicionDocumento(datosDocumento, 'CARTA', {
      ...preferenciasImpresionPdf(),
      incluirLogo: false, incluirPie: false, copias: 2, margenMm: 20
    })
    const texto = JSON.stringify(definicion.content)
    expect(texto).not.toContain('◆ ENTERPRISE PRO ERP')
    expect(texto).not.toContain('No constituye certificación DGII')
    const bloques = definicion.content as Record<string, unknown>[]
    expect(bloques.filter((bloque) => bloque.pageBreak === 'before')).toHaveLength(1)
    expect(definicion.pageMargins).toEqual([20, 20, 20, 20].map(() => mmAPuntos(20)))
  })

  it('exige una carpeta relativa bajo userData', () => {
    const userDataPath = userDataTemporal()
    expect(() => resolverCarpetaExportacion(userDataPath, 'C:\\Windows\\Temp'))
      .toThrowError(/relativo/)
    expect(() => resolverCarpetaExportacion(userDataPath, '..\\salir'))
      .toThrowError(/letras|relativo/)
    expect(resolverCarpetaExportacion(userDataPath, 'exportaciones'))
      .toBe(resolve(join(userDataPath, 'exportaciones')))
  })

  it('filtra los formatos ofrecidos y resuelve la impresora de ticket', async () => {
    const db = testDb()
    const ctx = contextoReal(db)
    createAjustesService(db).save(ctx, {
      grupo: 'integraciones',
      datos: { ...defaultAjustes.integraciones, formatos: ['CSV'], impresoraTicket: 'POS-TICKET' }
    })
    const preferencias = preferenciasImpresionPdf({ db }, ctx)
    expect(preferencias.formatos).toEqual(['CSV'])
    expect(preferencias.impresoraTicket).toBe('POS-TICKET')

    await expect(generarPdf(ctx, { origen: 'venta', id: 1, formato: 'CARTA' }, fuentes(), { db }))
      .rejects.toThrowError(/no está habilitado/)
    db.close()
  })

  it('genera el archivo tras guardar un documento solo con permiso y preferencia activa', async () => {
    const db = testDb()
    const ctx = contextoReal(db)
    const userDataPath = userDataTemporal()
    createAjustesService(db).save(ctx, {
      grupo: 'integraciones',
      datos: {
        ...defaultAjustes.integraciones,
        formatos: ['CSV', 'PDF'], exportacionAutomatica: true, carpetaExportacion: 'exportaciones'
      }
    })
    const clienteId = Number(db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-AUTO', 'Cliente Automático')
    `).run().lastInsertRowid)
    db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha,
        total_cent, estado, usuario_id)
      VALUES (1, 'FACTURA_CONTADO', 'FAC-AUTO', ?, 'Cliente Automático', '2026-11-25', 118000, 'ACTIVO', ?)
    `).run(clienteId, ctx.userId)

    expect(await procesarExportacionesAutomaticas(db, userDataPath)).toBe(1)
    expect(readdirSync(join(userDataPath, 'exportaciones')).some((n) => n.endsWith('.pdf'))).toBe(true)
    const cola = db.prepare('SELECT estado FROM exportaciones_automaticas').get() as { estado: string }
    expect(cola.estado).toBe('EXPORTADA')
    const audit = db.prepare(`
      SELECT operacion FROM auditoria WHERE operacion = 'EXPORTACION_AUTOMATICA' LIMIT 1
    `).get() as { operacion: string } | undefined
    expect(audit?.operacion).toBe('EXPORTACION_AUTOMATICA')
    db.close()
  })

  it('deniega y audita la exportación automática sin reportes.exportar', async () => {
    const db = testDb()
    const userDataPath = userDataTemporal()
    const ctx = contextoReal(db)
    createAjustesService(db).save(ctx, {
      grupo: 'integraciones',
      datos: { ...defaultAjustes.integraciones, formatos: ['CSV', 'PDF'], exportacionAutomatica: true }
    })
    const rolId = Number(db.prepare(`
      INSERT INTO roles (empresa_id, nombre, descripcion) VALUES (1, 'SIN_EXPORTAR', 'Sin permisos de exportación')
    `).run().lastInsertRowid)
    const usuarioId = Number(db.prepare(`
      INSERT INTO usuarios (username, nombre, email, password_hash, salt, debe_cambiar_clave)
      VALUES ('sin_exportar', 'SIN EXPORTAR', '', 'x', 'y', 0)
    `).run().lastInsertRowid)
    db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id, empresa_id) VALUES (?, ?, 1)')
      .run(usuarioId, rolId)
    const clienteId = Number(db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-DENEGADO', 'Cliente Sin Permiso')
    `).run().lastInsertRowid)
    db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha,
        total_cent, estado, usuario_id)
      VALUES (1, 'FACTURA_CONTADO', 'FAC-DENEGADA', ?, 'Cliente Sin Permiso', '2026-11-25', 118000, 'ACTIVO', ?)
    `).run(clienteId, usuarioId)

    expect(await procesarExportacionesAutomaticas(db, userDataPath)).toBe(0)
    expect(existsSync(join(userDataPath, 'exportaciones'))).toBe(false)
    const cola = db.prepare('SELECT estado FROM exportaciones_automaticas').get() as { estado: string }
    expect(cola.estado).toBe('DENEGADA')
    const audit = db.prepare(`
      SELECT operacion FROM auditoria WHERE operacion = 'EXPORTACION_AUTOMATICA_DENEGADA' LIMIT 1
    `).get() as { operacion: string } | undefined
    expect(audit?.operacion).toBe('EXPORTACION_AUTOMATICA_DENEGADA')
    db.close()
  })

  it('omite la exportación cuando la preferencia está desactivada', async () => {
    const db = testDb()
    const ctx = contextoReal(db)
    const userDataPath = userDataTemporal()
    const clienteId = Number(db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-OMITIDA', 'Cliente Omitido')
    `).run().lastInsertRowid)
    db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha,
        total_cent, estado, usuario_id)
      VALUES (1, 'FACTURA_CONTADO', 'FAC-OMITIDA', ?, 'Cliente Omitido', '2026-11-25', 118000, 'ACTIVO', ?)
    `).run(clienteId, ctx.userId)

    expect(await procesarExportacionesAutomaticas(db, userDataPath)).toBe(0)
    const cola = db.prepare('SELECT estado FROM exportaciones_automaticas').get() as { estado: string }
    expect(cola.estado).toBe('OMITIDA')
    db.close()
  })
})
