import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { createVentasService } from '../../src/main/services/ventas.service'
import { createComprasService } from '../../src/main/services/compras.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import { createCobrosService } from '../../src/main/services/cobros.service'
import { createReportesService } from '../../src/main/services/reportes.service'
import { createEspacioService } from '../../src/main/services/espacio.service'
import { generarPdf } from '../../src/main/services/pdf.service'
import { permissionKeys, seedRoles } from '@shared/permissions'
import { defaultAjustes } from '@shared/schemas/ajustes'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>
const FECHA = '2026-01-15'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login(
    { username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'ESPACIO-PC'
  ).context as SessionContext
  const maestros = createMaestrosService(db)
  const inventario = createInventarioService(db)
  const ajustes = createAjustesService(db)
  const ventas = createVentasService(db, inventario, ajustes)
  const compras = createComprasService(db, inventario, ajustes)
  const finanzas = createFinanzasService(db, ajustes)
  const cobros = createCobrosService(db)
  const reportes = createReportesService(db)
  const espacio = createEspacioService(db)

  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre, rnc_cedula, condicion_pago_dias, limite_credito_cent)
    VALUES (1, 'ESP-CLI', 'Cliente Espacio', '123456789', 15, 1000000)
  `).run().lastInsertRowid)

  const productoId = Number((maestros.save(ctx, 'productos', {
    codigo: 'ESP-PRO', descripcion: 'Producto del espacio', tipo: 'FISICO',
    precio1Cent: 20000, precio2Cent: 0, precio3Cent: 0,
    precioMayoristaCent: 0, precioMinimoCent: 0,
    costoPromedioCent: 10000, costoUltimaCompraCent: 0,
    existenciaMin: 0, existenciaMax: 0, manejaSerie: false, manejaLote: false, activo: true
  }) as { id: number }).id)

  inventario.movimiento(ctx, {
    productoId, almacenId: 1, tipo: 'COMPRA', cantidad: 10,
    costoUnitCent: 10000, motivo: 'Alta inicial', referencia: ''
  })

  const documento = ventas.factura(ctx, {
    tipo: 'FACTURA_CONTADO', clienteId, fecha: FECHA,
    lineas: [{ productoId, cantidad: 2 }]
  }) as { id: number; numero: string; totalCent: number }

  return {
    db, ctx, maestros, inventario, ajustes, ventas, compras, finanzas,
    cobros, reportes, espacio, clienteId, productoId, documento
  }
}

const sinPermiso = (ctx: SessionContext, clave: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((permiso) => permiso !== clave)
})

const auditadas = (db: ReturnType<typeof testDb>, operacion: string): Fila[] =>
  db.prepare('SELECT * FROM auditoria WHERE operacion = ? ORDER BY id').all(operacion) as Fila[]

describe('Espacio de trabajo — datos reales y permisos', () => {
  it('la migración 014 crea las tablas y otorga los permisos del dominio', () => {
    const { db } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Fila[])
      .map((f) => String(f.name))
    expect(tablas).toContain('espacio_presets')
    expect(tablas).toContain('espacio_emisiones')

    const esperados = permissionKeys.filter((clave) => clave.startsWith('espacio.')).sort()
    const materializados = (db.prepare("SELECT clave FROM permisos WHERE clave LIKE 'espacio.%'").all() as Fila[])
      .map((f) => String(f.clave)).sort()
    expect(materializados).toEqual(esperados)

    const permisosPorRol = (nombre: string): string[] => (db.prepare(`
      SELECT p.clave FROM roles r
        JOIN rol_permisos rp ON rp.rol_id = r.id
        JOIN permisos p ON p.id = rp.permiso_id
       WHERE r.nombre = ? AND p.clave LIKE 'espacio.%'
    `).all(nombre) as Fila[]).map((f) => String(f.clave)).sort()
    expect(permisosPorRol('Administrador')).toEqual(esperados)

    const filtroGerente = seedRoles.find((rol) => rol.name === 'Gerente')?.permissionFilter ?? (() => true)
    expect(permisosPorRol('Gerente')).toEqual(esperados.filter(filtroGerente))
    db.close()
  })

  it('el panel y los comprobantes leen documentos reales y respetan permisos', () => {
    const { db, ctx, espacio, documento } = setup()
    const resumen = espacio.resumen(ctx, {
      vista: 'GENERAL', periodo: 'PERSONALIZADO', fechaDesde: FECHA, fechaHasta: FECHA
    }) as { kpis: { ventasCent: number }; serie: Fila[] }
    expect(resumen.kpis.ventasCent).toBe(documento.totalCent)
    expect(resumen.serie.length).toBeGreaterThan(0)

    const comprobantes = espacio.comprobantes(ctx, { origen: 'venta', texto: documento.numero }) as {
      filas: Fila[]
    }
    expect(comprobantes.filas).toHaveLength(1)
    expect(comprobantes.filas[0].totalCent).toBe(documento.totalCent)

    expect(() => espacio.resumen(sinPermiso(ctx, 'espacio.consultar'), {})).toThrow(/permiso/i)
    expect(() => espacio.comprobantes(sinPermiso(ctx, 'espacio.consultar'), {})).toThrow(/permiso/i)
    db.close()
  })

  it('exporta comprobantes a CSV con auditoría y exige espacio.exportar', () => {
    const { db, ctx, espacio, documento } = setup()
    expect(() => espacio.exportar(sinPermiso(ctx, 'espacio.exportar'), {})).toThrow(/permiso/i)

    const archivo = espacio.exportar(ctx, { origen: 'venta', texto: documento.numero }) as {
      filename: string; base64: string; mime: string; registros: number
    }
    const csv = Buffer.from(archivo.base64, 'base64').toString('utf8')
    expect(archivo.mime).toBe('text/csv')
    expect(archivo.filename).toMatch(/^espacio-comprobantes-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(archivo.registros).toBe(1)
    expect(csv).toContain(documento.numero)
    expect(csv).toContain('"Origen","Tipo","Número"')
    expect(auditadas(db, 'EXPORTAR')).toHaveLength(1)
    db.close()
  })

  it('guarda, actualiza y elimina plantillas con auditoría real', () => {
    const { db, ctx, espacio } = setup()
    const guardado = espacio.guardarPreset(ctx, {
      nombre: 'Mostrador rápido', descripcion: 'Vista densa para mostrador',
      settings: { theme: 'dark' }, ajustes: { interfaz: defaultAjustes.interfaz }
    }) as { id: number }

    const actualizado = espacio.guardarPreset(ctx, {
      id: guardado.id, nombre: 'Mostrador rápido', descripcion: 'Vista compacta',
      settings: { theme: 'light' }, ajustes: { interfaz: defaultAjustes.interfaz }
    }) as { id: number }
    expect(actualizado.id).toBe(guardado.id)

    const listado = espacio.listarPresets(ctx) as { plantillas: Fila[] }
    expect(listado.plantillas).toHaveLength(1)
    expect(listado.plantillas[0].descripcion).toBe('Vista compacta')

    expect(() => espacio.guardarPreset(sinPermiso(ctx, 'espacio.modificar'), {
      nombre: 'Sin permiso', settings: {}, ajustes: {}
    })).toThrow(/permiso/i)

    espacio.eliminarPreset(ctx, { id: guardado.id })
    expect((espacio.listarPresets(ctx) as { plantillas: Fila[] }).plantillas).toHaveLength(0)
    for (const operacion of ['CREAR', 'MODIFICAR', 'ELIMINAR']) {
      expect(auditadas(db, operacion).some((f) => String(f.entidad) === 'espacio_presets')).toBe(true)
    }
    db.close()
  })

  it('diagnostica la base y reindexa solo con confirmación y permiso', () => {
    const { db, ctx, espacio } = setup()
    const diagnostico = espacio.diagnosticar(ctx) as {
      calificacion: string; comprobaciones: { estado: string }[]; base: { ultimaMigracion: number }
    }
    expect(diagnostico.calificacion).toBe('ok')
    expect(diagnostico.comprobaciones.every((c) => c.estado === 'ok')).toBe(true)
    expect(diagnostico.base.ultimaMigracion).toBe(15)

    expect(() => espacio.reindexar(ctx, { confirmacion: 'OTRO' })).toThrow()
    expect(() => espacio.reindexar(sinPermiso(ctx, 'espacio.mantenimiento'), {
      confirmacion: 'REINDEX'
    })).toThrow(/permiso/i)

    const resultado = espacio.reindexar(ctx, { confirmacion: 'REINDEX' }) as { ok: boolean }
    expect(resultado.ok).toBe(true)
    expect(auditadas(db, 'REINDEX')).toHaveLength(1)
    db.close()
  })

  it('emite un PDF real del documento y registra la emisión en el historial', async () => {
    const {
      db, ctx, espacio, ventas, compras, finanzas, cobros, reportes, documento
    } = setup()
    const solicitud = {
      origen: 'venta' as const, id: documento.id, formato: 'CARTA' as const,
      motivo: 'Reimpresión desde Espacio de trabajo'
    }
    const archivo = await generarPdf(
      ctx,
      { origen: solicitud.origen, id: solicitud.id, formato: solicitud.formato, tipo: 'DOCUMENTO' },
      { ventas, compras, finanzas, cobros, reportes } as never
    )
    expect(Buffer.from(archivo.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-')

    espacio.registrarEmision(ctx, solicitud, archivo)
    const historial = espacio.historialEmisiones(ctx) as { emisiones: Fila[] }
    expect(historial.emisiones).toHaveLength(1)
    expect(String(historial.emisiones[0].numero)).toBe(documento.numero)
    expect(String(historial.emisiones[0].formato)).toBe('CARTA')
    expect(auditadas(db, 'EMITIR_COMPROBANTE')).toHaveLength(1)
    expect(() => espacio.registrarEmision(sinPermiso(ctx, 'espacio.imprimir'), solicitud, archivo))
      .toThrow(/permiso/i)
    db.close()
  })
})
