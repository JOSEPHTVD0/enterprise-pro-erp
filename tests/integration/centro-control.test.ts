import { describe, it, expect } from 'vitest'
import type { SessionContext } from '@shared/session'
import { testDb } from '../helpers/db'
import { createAuthService } from '../../src/main/services/auth.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { createSeguridadService } from '../../src/main/services/seguridad.service'
import { createInteligenciaService } from '../../src/main/services/inteligencia.service'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { defaultAjustes } from '@shared/schemas/ajustes'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-CENTRO')
  const ctx = login.context! as SessionContext
  const ajustes = createAjustesService(db)
  return { db, ctx, ajustes, auth, seguridad: createSeguridadService(db), login }
}

const sin = (ctx: SessionContext, permiso: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((p) => p !== permiso)
})

describe('centro de control 0.5.0', () => {
  it('guarda ajustes en SQLite, los lee y registra la auditoría', () => {
    const { db, ctx, ajustes } = setup()
    expect(ajustes.get(ctx, { grupo: 'alertas' }).alertas?.stockBajoUmbral).toBe(5)

    ajustes.save(ctx, { grupo: 'alertas', datos: { ...defaultAjustes.alertas, stockBajoUmbral: 12 } })
    expect(ajustes.get(ctx, { grupo: 'alertas' }).alertas?.stockBajoUmbral).toBe(12)
    const fila = db.prepare("SELECT datos_json FROM ajustes WHERE empresa_id = 1 AND grupo = 'alertas'").get() as { datos_json: string }
    expect(JSON.parse(fila.datos_json).stockBajoUmbral).toBe(12)
    const Audit = db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE entidad = 'ajustes' AND entidad_id = 'alertas'").get() as { total: number }
    expect(Audit.total).toBe(1)
    db.close()
  })

  it('completa una fila heredada parcial sin exponer grupos operativos', () => {
    const { db, ctx, ajustes } = setup()
    db.prepare(`
      INSERT INTO ajustes (empresa_id, grupo, datos_json)
      VALUES (1, 'interfaz', ?)
    `).run(JSON.stringify({ tituloApp: 'PRUEBA SUCIA' }))

    const efectivos = ajustes.efectivos(ctx) as Record<string, Record<string, unknown>>
    expect(efectivos.interfaz.tituloApp).toBe('PRUEBA SUCIA')
    expect(efectivos.interfaz.ocultarElementos).toEqual(defaultAjustes.interfaz.ocultarElementos)
    expect(efectivos.interfaz.ordenGrupos).toEqual(defaultAjustes.interfaz.ordenGrupos)
    expect(efectivos.seguridad).toBeUndefined()
    expect(efectivos.fiscal).toBeUndefined()
    expect(efectivos.integraciones).toBeUndefined()
    expect(efectivos.rendimiento).toBeUndefined()
    db.close()
  })

  it('restaura un grupo a los defaults auditados', () => {
    const { db, ctx, ajustes } = setup()
    ajustes.save(ctx, { grupo: 'tema', datos: { ...defaultAjustes.tema, escala: 1.25 } })
    ajustes.reset(ctx, { grupo: 'tema' })
    expect(ajustes.get(ctx, { grupo: 'tema' }).tema?.escala).toBe(defaultAjustes.tema.escala)
    const total = db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE entidad = 'ajustes'").get() as { total: number }
    expect(total.total).toBe(2)
    db.close()
  })

  it('exige permisos específicos para leer, modificar y restaurar', () => {
    const { db, ctx, ajustes } = setup()
    expect(() => ajustes.get(sin(ctx, 'configuracion.ajustes.consultar'), {})).toThrow(/permiso/i)
    expect(() => ajustes.save(sin(ctx, 'configuracion.ajustes.modificar'), {
      grupo: 'alertas', datos: defaultAjustes.alertas
    })).toThrow(/permiso/i)
    expect(() => ajustes.save(ctx, {
      grupo: 'seguridad', datos: defaultAjustes.seguridad
    })).not.toThrow()
    expect(() => ajustes.save(sin(ctx, 'configuracion.ajustes.seguridad.modificar'), {
      grupo: 'seguridad', datos: defaultAjustes.seguridad
    })).toThrow(/permiso/i)
    expect(() => ajustes.reset(sin(ctx, 'configuracion.ajustes.restaurar'), { grupo: 'alertas' })).toThrow(/permiso/i)
    db.close()
  })

  it('describe cada permiso y bloquea ediciones peligrosas de roles', () => {
    const { db, ctx, seguridad } = setup()
    const catalogo = seguridad.permissionCatalog(ctx)
    expect(catalogo.every((p) => p.descripcion.length > 10)).toBe(true)
    expect(catalogo.every((p) => typeof p.critico === 'boolean')).toBe(true)
    expect(catalogo.some((p) => p.key === 'configuracion.ajustes.modificar' && p.descripcion)).toBe(true)

    const roles = seguridad.listRoles(ctx) as { id: number; nombre: string }[]
    const gerente = roles.find((r) => r.nombre === 'Gerente')!
    const detalle = seguridad.getRolePermissions(ctx, gerente.id) as { permisos: { key: string }[] }
    expect(detalle.permisos.length).toBeGreaterThan(0)

    const admin = roles.find((r) => r.nombre === 'Administrador')!
    expect(() => seguridad.replaceRolePermissions(ctx, {
      rolId: admin.id, permisos: [], confirmarCriticos: true, motivo: 'prueba'
    })).toThrow(/Administrador/)

    const claves = detalle.permisos.map((p) => p.key)
    expect(() => seguridad.replaceRolePermissions(ctx, {
      rolId: gerente.id,
      permisos: [...claves.filter((k) => k !== 'ventas.consultar'), 'seguridad.permiso.modificar'],
      confirmarCriticos: false, motivo: 'sin confirmar'
    })).toThrow(/confirmación/i)

    const resultado = seguridad.replaceRolePermissions(ctx, {
      rolId: gerente.id,
      permisos: [...claves.filter((k) => k !== 'ventas.consultar'), 'seguridad.permiso.modificar'],
      confirmarCriticos: true, motivo: 'prueba controlada'
    }) as { agregados: string[]; removidos: string[] }
    expect(resultado.removidos).toContain('ventas.consultar')
    expect(resultado.agregados).toContain('seguridad.permiso.modificar')
    const audit = db.prepare("SELECT valores_despues FROM auditoria WHERE entidad = 'rol_permisos' ORDER BY id DESC LIMIT 1").get() as { valores_despues: string }
    expect(JSON.parse(audit.valores_despues).motivo).toBe('prueba controlada')
    db.close()
  })

  it('calcula inteligencia con datos reales y respeta permisos finos', () => {
    const { db, ctx, ajustes } = setup()
    const intel = createInteligenciaService(db, ajustes)
    const clienteId = Number(db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-INT-1', 'Cliente Inteligencia')
    `).run().lastInsertRowid)
    const ventaId = Number(db.prepare(`
      INSERT INTO documentos_venta (
        empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, estado,
        subtotal_cent, impuesto_cent, total_cent, costo_total_cent
      ) VALUES (1, 'FACTURA_CREDITO', 'FCR-INT-1', ?, 'Cliente Inteligencia', '2026-01-10', 'ACTIVO', 15000, 0, 15000, 9000)
    `).run(clienteId).lastInsertRowid)
    db.prepare(`
      INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
      VALUES (1, ?, ?, 'FCR-INT-1', '2026-01-10', '2026-02-10', 15000, 9000, 'PENDIENTE')
    `).run(clienteId, ventaId)
    const resumen = intel.resumen(ctx, { periodo: 'ANIO' }) as {
      diagnostico: { cxcVencido: number }
      alertas: { texto: string }[]
      agingCxc: { bucket: string; saldoCent: number }[]
      rentabilidad: unknown[]
    }
    expect(resumen.diagnostico.cxcVencido).toBe(1)
    expect(resumen.alertas.some((a) => a.texto.includes('CxC'))).toBe(true)
    expect(resumen.agingCxc.find((b) => b.bucket === '90_PLUS')?.saldoCent).toBe(9000)

    expect(() => intel.resumen(sin(ctx, 'inteligencia.consultar'), { periodo: 'ANIO' })).toThrow(/permiso/i)
    expect(resumen.rentabilidad).toBeDefined()
    db.close()
  })

  it('filtra las alertas de inteligencia por destino y nivel administrados', () => {
    const { db, ctx, ajustes } = setup()
    const intel = createInteligenciaService(db, ajustes)
    const clienteId = Number(db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-ALERTA', 'Cliente Alerta')
    `).run().lastInsertRowid)
    const ventaId = Number(db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha,
        total_cent, estado)
      VALUES (1, 'FACTURA_CREDITO', 'FAC-ALERTA', ?, 'Cliente Alerta', '2026-01-02', 10000, 'ACTIVO')
    `).run(clienteId).lastInsertRowid)
    db.prepare(`
      INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento,
        monto_cent, saldo_cent, estado)
      VALUES (1, ?, ?, 'FAC-ALERTA', '2026-01-02', '2026-01-03', 10000, 10000, 'PENDIENTE')
    `).run(clienteId, ventaId)

    ajustes.save(ctx, {
      grupo: 'alertas',
      datos: { ...defaultAjustes.alertas, nivelMinimo: 'ALTO', destinos: ['PANEL'] }
    })
    const filtradas = intel.resumen(ctx, { periodo: 'ANIO' }) as { alertas: { nivel: string; texto: string }[] }
    expect(filtradas.alertas.length).toBeGreaterThan(0)
    expect(filtradas.alertas.every((a) => a.nivel === 'Alto')).toBe(true)

    ajustes.save(ctx, {
      grupo: 'alertas',
      datos: { ...defaultAjustes.alertas, nivelMinimo: 'INFO', destinos: ['TOAST'] }
    })
    const sinPanel = intel.resumen(ctx, { periodo: 'ANIO' }) as { alertas: unknown[] }
    expect(sinPanel.alertas).toEqual([])
    db.close()
  })

  it('crea permisos personalizados con descripción, los asigna y los audita', () => {
    const { db, ctx, auth, seguridad } = setup()
    seguridad.saveCustomPermission(ctx, {
      key: 'custom.reporte_gerencia',
      label: 'Reporte de gerencia',
      descripcion: 'Permite consultar el panel gerencial personalizado de la empresa.',
      module: 'reportes',
      critico: false
    })

    const catalogo = seguridad.permissionCatalog(ctx) as {
      key: string; descripcion: string; personalizado?: boolean; critico: boolean
    }[]
    const creado = catalogo.find((p) => p.key === 'custom.reporte_gerencia')!
    expect(creado.personalizado).toBe(true)
    expect(creado.descripcion).toContain('panel gerencial')

    const roles = seguridad.listRoles(ctx) as { id: number; nombre: string }[]
    const admin = roles.find((r) => r.nombre === 'Administrador')!
    const gerente = roles.find((r) => r.nombre === 'Gerente')!
    const adminPermisos = seguridad.getRolePermissions(ctx, admin.id) as { permisos: { key: string }[] }
    expect(adminPermisos.permisos.some((p) => p.key === 'custom.reporte_gerencia')).toBe(true)

    const detalle = seguridad.getRolePermissions(ctx, gerente.id) as { permisos: { key: string }[] }
    const claves = detalle.permisos.map((p) => p.key)
    const asignado = seguridad.replaceRolePermissions(ctx, {
      rolId: gerente.id,
      permisos: [...claves, 'custom.reporte_gerencia'],
      confirmarCriticos: false,
      motivo: 'acceso gerencial'
    }) as { agregados: string[] }
    expect(asignado.agregados).toContain('custom.reporte_gerencia')

    const usuario = seguridad.createUser(ctx, {
      username: 'gerente_custom',
      nombre: 'Gerente Personalizado',
      email: '',
      roles: [{ rolId: gerente.id, empresaId: 1 }],
      activo: true
    })
    const sesion = auth.login({ username: 'gerente_custom', password: usuario.contrasenaInicial }, 'PC-CUSTOM')
    expect(sesion.context!.permisos).toContain('custom.reporte_gerencia')

    seguridad.saveCustomPermission(ctx, {
      key: 'custom.auditoria_interna',
      label: 'Auditoría interna',
      descripcion: 'Permite revisar el cuadro de auditoría interna personalizado.',
      module: 'auditoria',
      critico: true
    })
    expect(() => seguridad.replaceRolePermissions(ctx, {
      rolId: gerente.id,
      permisos: [...claves, 'custom.reporte_gerencia', 'custom.auditoria_interna'],
      confirmarCriticos: false,
      motivo: 'sin confirmar'
    })).toThrow(/confirmación/i)

    seguridad.deleteCustomPermission(ctx, 'custom.reporte_gerencia')
    expect(seguridad.permissionCatalog(ctx).some((p) => p.key === 'custom.reporte_gerencia')).toBe(false)
    const audit = db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE entidad = 'permisos'").get() as { total: number }
    expect(audit.total).toBe(3)
    db.close()
  })

  it('resuelve capas visuales por rol y permiso sin exponer grupos operativos', () => {
    const { db, ctx, ajustes, seguridad } = setup()
    const creado = seguridad.createRole(ctx, {
      nombre: 'Capa Visual', descripcion: 'Solo personalización visual', permisos: []
    }) as { id: number }
    db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id, empresa_id) VALUES (?, ?, 1)')
      .run(ctx.userId, creado.id)

    ajustes.save(ctx, {
      grupo: 'interfaz', datos: { ...defaultAjustes.interfaz, tituloApp: 'BASE EMPRESA' }
    })
    ajustes.savePersonalizado(ctx, {
      ambito: 'ROL', objetivo: String(creado.id), grupo: 'interfaz', datos: { tituloApp: 'SOLO ESTE ROL' }
    })
    ajustes.savePersonalizado(ctx, {
      ambito: 'PERMISO', objetivo: 'ventas.consultar', grupo: 'interfaz', datos: { anchoSidebar: 300 }
    })

    const efectivos = ajustes.efectivos(ctx)
    expect(efectivos.interfaz?.tituloApp).toBe('SOLO ESTE ROL')
    expect(efectivos.interfaz?.anchoSidebar).toBe(300)
    expect(efectivos.seguridad).toBeUndefined()
    expect(efectivos.fiscal).toBeUndefined()
    expect(efectivos.alertas).toBeDefined()
    expect(efectivos.notificaciones).toBeDefined()
    expect(efectivos.panel2026).toBeDefined()

    expect(() => ajustes.savePersonalizado(sin(ctx, 'configuracion.ajustes.modificar'), {
      ambito: 'ROL', objetivo: String(creado.id), grupo: 'interfaz', datos: { tituloApp: 'OTRO' }
    })).toThrow(/permiso/i)
    expect(() => ajustes.savePersonalizado(ctx, {
      ambito: 'PERMISO', objetivo: 'custom.inexistente', grupo: 'interfaz', datos: {}
    })).toThrow(/no encontrad/i)

    const audit = db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE entidad = 'ajustes_personalizados'").get() as { total: number }
    expect(audit.total).toBe(2)
    db.close()
  })

  it('crea y elimina roles personalizados pero protege los roles del sistema', () => {
    const { db, ctx, seguridad } = setup()
    const creado = seguridad.createRole(ctx, {
      nombre: 'Cobrador Temporal', descripcion: 'Rol de prueba', permisos: ['cobros.consultar']
    }) as { id: number }
    expect(seguridad.getRole(ctx, creado.id)).toMatchObject({ nombre: 'Cobrador Temporal' })

    const sistema = (db.prepare("SELECT id FROM roles WHERE empresa_id = 1 AND nombre = 'Vendedor'").get() as { id: number }).id
    expect(() => seguridad.deleteRole(ctx, sistema)).toThrow(/sistema/i)
    expect(seguridad.deleteRole(ctx, creado.id)).toMatchObject({ ok: true })
    expect(db.prepare('SELECT 1 FROM roles WHERE id = ?').get(creado.id)).toBeUndefined()
    const audit = db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE entidad = 'roles' AND operacion = 'ELIMINAR'").get() as { total: number }
    expect(audit.total).toBe(1)
    db.close()
  })
})
