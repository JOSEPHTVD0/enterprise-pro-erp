import { describe, expect, it } from 'vitest'
import { planCuentasBase } from '../../src/shared/contabilidad'
import type { SessionContext } from '@shared/session'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { seedPlanContable } from '../../src/main/repositories/contabilidad.repo'
import { createContabilidadService } from '../../src/main/services/contabilidad.service'
import { createAuthService } from '../../src/main/services/auth.service'
import { testDb } from '../helpers/db'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, clave: string): number => Number(f?.[clave] ?? 0)
const txt = (f: Fila | undefined, clave: string): string => String(f?.[clave] ?? '')

const PERMISOS_CONTABILIDAD = [
  'contabilidad.consultar', 'contabilidad.crear', 'contabilidad.modificar', 'contabilidad.anular',
  'contabilidad.asiento.confirmar', 'contabilidad.periodo.cerrar', 'contabilidad.integrar'
]

/** La migración 008 ya está registrada en connection.ts; testDb() la aplica junto con seed. */
function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-CONTABILIDAD')
  const base = login.context as SessionContext
  const ctx: SessionContext = {
    ...base,
    permisos: [...base.permisos, ...PERMISOS_CONTABILIDAD]
  }
  const contabilidad = createContabilidadService(db)
  const cuenta = (codigo: string): number => Number((db.prepare(
    'SELECT id FROM plan_cuentas WHERE empresa_id = 1 AND codigo = ?'
  ).get(codigo) as { id: number }).id)
  const hoy = new Date().toISOString().slice(0, 10)
  return { db, ctx, base, contabilidad, cuenta, hoy }
}

function asientoBalanceado(cuenta: (codigo: string) => number, fecha: string, descripcion: string) {
  return {
    fecha,
    descripcion,
    lineas: [
      { cuentaId: cuenta('1110'), debeCent: 10000, haberCent: 0 },
      { cuentaId: cuenta('4100'), debeCent: 0, haberCent: 10000 }
    ]
  }
}

describe('contabilidad — migración, asientos y reportes', () => {
  it('la migración 008 crea tablas, serie, periodos y plan base sembrado', () => {
    const { db } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Fila[])
      .map((f) => txt(f, 'name'))
    for (const tabla of ['plan_cuentas', 'periodos_contables', 'asientos', 'asiento_lineas']) {
      expect(tablas).toContain(tabla)
    }
    expect(db.prepare("SELECT COUNT(*) AS total FROM plan_cuentas WHERE empresa_id = 1").get()).toMatchObject({
      total: planCuentasBase.length
    })
    expect(db.prepare("SELECT COUNT(*) AS total FROM periodos_contables WHERE empresa_id = 1").get()).toMatchObject({
      total: 12
    })
    const series = (db.prepare("SELECT tipo_doc FROM series_documento WHERE empresa_id = 1").all() as Fila[])
      .map((f) => txt(f, 'tipo_doc'))
    expect(series).toContain('ASIENTO')
    const hijo = db.prepare("SELECT padre_id, nivel, acepta_movimiento FROM plan_cuentas WHERE empresa_id = 1 AND codigo = '1110'").get() as Fila
    const padre = db.prepare("SELECT id FROM plan_cuentas WHERE empresa_id = 1 AND codigo = '1100'").get() as Fila
    expect(n(hijo, 'padre_id')).toBe(n(padre, 'id'))
    expect(n(hijo, 'nivel')).toBe(3)
    expect(n(hijo, 'acepta_movimiento')).toBe(1)
    db.close()
  })

  it('seedPlanContable siembra el plan en una empresa creada después', () => {
    const { db } = setup()
    const empresaId = Number(db.prepare(`
      INSERT INTO empresas (nombre_comercial, razon_social) VALUES ('Nueva empresa', 'NUEVA EMPRESA, SRL')
    `).run().lastInsertRowid)
    seedPlanContable(db, empresaId)
    expect(n(db.prepare('SELECT COUNT(*) AS total FROM plan_cuentas WHERE empresa_id = ?').get(empresaId) as Fila, 'total'))
      .toBe(planCuentasBase.length)
    seedPlanContable(db, empresaId)
    expect(n(db.prepare('SELECT COUNT(*) AS total FROM plan_cuentas WHERE empresa_id = ?').get(empresaId) as Fila, 'total'))
      .toBe(planCuentasBase.length)
    db.close()
  })

  it('crea asientos balanceados con numeración consecutiva y rechaza los inválidos', () => {
    const { db, ctx, contabilidad, cuenta, hoy } = setup()
    const primero = contabilidad.asientoCrear(ctx, asientoBalanceado(cuenta, hoy, 'Venta del día')) as Fila
    const segundo = contabilidad.asientoCrear(ctx, asientoBalanceado(cuenta, hoy, 'Otra venta del día')) as Fila
    expect(txt(primero, 'numero')).toBe('ASI-00000001')
    expect(txt(segundo, 'numero')).toBe('ASI-00000002')
    expect(txt(primero, 'estado')).toBe('BORRADOR')

    expect(() => contabilidad.asientoCrear(ctx, {
      fecha: hoy,
      descripcion: 'Asiento descuadrado',
      lineas: [
        { cuentaId: cuenta('1110'), debeCent: 10000, haberCent: 0 },
        { cuentaId: cuenta('4100'), debeCent: 0, haberCent: 9000 }
      ]
    })).toThrow(/descuadrado/i)

    expect(() => contabilidad.asientoCrear(ctx, {
      fecha: hoy,
      descripcion: 'Cuenta inexistente',
      lineas: [
        { cuentaId: 999999, debeCent: 10000, haberCent: 0 },
        { cuentaId: cuenta('4100'), debeCent: 0, haberCent: 10000 }
      ]
    })).toThrow(/no existe/i)

    expect(() => contabilidad.asientoCrear(ctx, {
      fecha: hoy,
      descripcion: 'Cuenta cabecera',
      lineas: [
        { cuentaId: cuenta('1000'), debeCent: 10000, haberCent: 0 },
        { cuentaId: cuenta('4100'), debeCent: 0, haberCent: 10000 }
      ]
    })).toThrow(/no acepta movimientos/i)

    expect(n(db.prepare('SELECT COUNT(*) AS total FROM asientos').get() as Fila, 'total')).toBe(2)
    db.close()
  })

  it('confirma, anula y alimenta libro diario, mayor, balances y estado de resultados', () => {
    const { db, ctx, contabilidad, cuenta, hoy } = setup()
    const primero = contabilidad.asientoCrear(ctx, asientoBalanceado(cuenta, hoy, 'Venta confirmada')) as Fila
    const segundo = contabilidad.asientoCrear(ctx, {
      fecha: hoy,
      descripcion: 'Gasto de oficina',
      lineas: [
        { cuentaId: cuenta('5100'), debeCent: 3000, haberCent: 0 },
        { cuentaId: cuenta('1110'), debeCent: 0, haberCent: 3000 }
      ]
    }) as Fila
    expect(txt(contabilidad.asientoConfirmar(ctx, { id: n(primero, 'id'), estado: 'CONFIRMAR' }), 'estado')).toBe('CONFIRMADO')
    expect(txt(contabilidad.asientoConfirmar(ctx, { id: n(segundo, 'id'), estado: 'CONFIRMAR' }), 'estado')).toBe('CONFIRMADO')

    const diario = contabilidad.libroDiario(ctx) as Fila[]
    expect(diario.length).toBe(4)
    expect(txt(diario[0], 'numero')).toBe('ASI-00000001')

    const mayorCaja = contabilidad.mayor(ctx, { cuentaId: cuenta('1110') }) as Fila[]
    expect(mayorCaja.length).toBe(2)
    expect(n(mayorCaja[0], 'saldoCent')).toBe(10000)
    expect(n(mayorCaja[1], 'saldoCent')).toBe(7000)

    const comprobacion = contabilidad.balanceComprobacion(ctx) as Fila[]
    const caja = comprobacion.find((f) => txt(f, 'codigo') === '1110')
    expect(n(caja, 'debeCent')).toBe(10000)
    expect(n(caja, 'haberCent')).toBe(3000)
    expect(n(caja, 'saldoDeudorCent')).toBe(7000)

    const resultados = contabilidad.estadoResultados(ctx) as Fila
    expect(n(resultados, 'ingresosCent')).toBe(10000)
    expect(n(resultados, 'gastosCent')).toBe(3000)
    expect(n(resultados, 'resultadoCent')).toBe(7000)

    const balance = contabilidad.balanceGeneral(ctx) as Fila
    expect(n(balance, 'activoCent')).toBe(7000)
    expect(n(balance, 'pasivoCent')).toBe(0)
    expect(n(balance, 'patrimonioCent')).toBe(0)
    expect(n(balance, 'resultadoCent')).toBe(7000)
    expect(n(balance, 'pasivoMasPatrimonioCent')).toBe(7000)

    expect(txt(contabilidad.asientoAnular(ctx, { id: n(primero, 'id'), estado: 'ANULAR' }), 'estado')).toBe('ANULADO')
    expect((contabilidad.libroDiario(ctx) as Fila[]).length).toBe(2)
    expect(n(contabilidad.estadoResultados(ctx) as Fila, 'ingresosCent')).toBe(0)
    db.close()
  })

  it('la confirmación vuelve a validar el balance del asiento', () => {
    const { db, ctx, contabilidad, cuenta, hoy } = setup()
    const asiento = contabilidad.asientoCrear(ctx, asientoBalanceado(cuenta, hoy, 'A alterar')) as Fila
    db.prepare('UPDATE asiento_lineas SET debe_centavos = 9999 WHERE asiento_id = ?').run(n(asiento, 'id'))
    expect(() => contabilidad.asientoConfirmar(ctx, { id: n(asiento, 'id'), estado: 'CONFIRMAR' }))
      .toThrow(/descuadrado/i)
    db.close()
  })

  it('cierra el periodo solo cuando no quedan borradores', () => {
    const { db, ctx, contabilidad, cuenta, hoy } = setup()
    const periodo = db.prepare('SELECT id FROM periodos_contables WHERE empresa_id = 1 AND anio = ? AND mes = ?')
      .get(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))) as { id: number }
    const asiento = contabilidad.asientoCrear(ctx, asientoBalanceado(cuenta, hoy, 'Pendiente')) as Fila
    expect(() => contabilidad.periodoCerrar(ctx, { id: periodo.id })).toThrow(/borrador/i)
    expect(txt(contabilidad.asientoConfirmar(ctx, { id: n(asiento, 'id'), estado: 'CONFIRMAR' }), 'estado')).toBe('CONFIRMADO')
    expect(txt(contabilidad.periodoCerrar(ctx, { id: periodo.id }), 'estado')).toBe('CERRADO')
    expect(() => contabilidad.periodoCerrar(ctx, { id: periodo.id })).toThrow(/ya está cerrado/i)
    expect(() => contabilidad.asientoCrear(ctx, asientoBalanceado(cuenta, hoy, 'Fuera de periodo')))
      .toThrow(/período contable abierto/i)
    db.close()
  })

  it('integra ventas confirmadas pendientes y evita duplicados', () => {
    const { db, ctx, contabilidad, hoy } = setup()
    db.prepare("INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-CONT-1', 'Cliente Contabilidad')").run()
    db.prepare(`
      INSERT INTO documentos_venta
        (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, condicion, estado,
         subtotal_cent, impuesto_cent, total_cent)
      VALUES (1, 'FACTURA_CREDITO', 'FAC-CONT-1', 1, 'Cliente Contabilidad', ?, 'CREDITO', 'ACTIVO',
              10000, 1800, 11800)
    `).run(hoy)
    const integrado = contabilidad.integrarDocumentos(ctx) as Fila
    expect(n(integrado, 'asientosCreados')).toBe(1)
    expect(n(integrado, 'documentos')).toBe(1)
    const asiento = db.prepare("SELECT * FROM asientos WHERE tipo = 'VENTA'").get() as Fila
    expect(txt(asiento, 'numero')).toBe('ASI-00000001')
    expect(txt(asiento, 'estado')).toBe('BORRADOR')
    const lineas = db.prepare('SELECT * FROM asiento_lineas WHERE asiento_id = ? ORDER BY orden')
      .all(n(asiento, 'id')) as Fila[]
    expect(lineas.length).toBe(3)
    expect(n(lineas[0], 'debe_centavos')).toBe(11800)
    expect(n(lineas[1], 'haber_centavos')).toBe(10000)
    expect(n(lineas[2], 'haber_centavos')).toBe(1800)
    expect(n(contabilidad.integrarDocumentos(ctx) as Fila, 'asientosCreados')).toBe(0)
    db.close()
  })

  it('vuelve a verificar permisos en el backend', () => {
    const { db, ctx, contabilidad, cuenta, hoy } = setup()
    const sinCrear: SessionContext = {
      ...ctx,
      permisos: ctx.permisos.filter((p) => p !== 'contabilidad.crear')
    }
    expect(() => contabilidad.asientoCrear(sinCrear, asientoBalanceado(cuenta, hoy, 'Sin permiso')))
      .toThrow(/permiso/i)
    expect(() => contabilidad.cuentas({ ...ctx, permisos: ctx.permisos.filter((p) => p !== 'contabilidad.consultar') }))
      .toThrow(/permiso/i)
    db.close()
  })
})
