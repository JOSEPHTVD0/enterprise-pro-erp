import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { errors } from '@shared/errors'
import { redondear } from '@shared/dinero'
import { writeAudit } from '../repositories/auditoria.repo'
import type { Fila } from '../repositories/ventas.repo'
import { getEmpresa, nextSerieNumber } from '../repositories/configuracion.repo'
import * as aux from '../repositories/auxiliares.repo'
import * as cxp from '../repositories/cxp.repo'
import * as fin from '../repositories/finanzas.repo'
import { metodosPagoFinanzas } from '@shared/schemas/finanzas'
import { formatosImpresion } from '@shared/schemas/ventas'
import type {
  FinanzasFiltro, FinanzasFiltroInput, MovimientosBancoFiltro, MovimientosBancoFiltroInput,
  SesionesCajaFiltro, SesionesCajaFiltroInput,
  CxcReciboCrearInput, CxpPagoCrearInput, AnticipoCrearInput, AnularFinanzasInput,
  ReferenciaFinanzasInput, ImprimirFinanzasInput, ExportarFinanzasInput,
  BancoCuentaInput, BancoMovimientoInput, BancoConciliacionInput,
  AbrirCajaFinanzasInput, CerrarCajaFinanzasInput, MovimientoCajaManualInput,
  GastoCategoriaInput, GastoCrearInput, GastoPagarInput, GastoRecurrenteInput,
  ComisionCrearInput, ComisionPagarInput
} from '@shared/schemas/finanzas'

type Operacion = 'CREAR' | 'MODIFICAR' | 'ANULAR'
type Direccion = 'INGRESO' | 'EGRESO'
type TipoFinanzas = 'cxc' | 'cxp' | 'bancos' | 'cajas'

type Contrapartida = {
  cajaSesionId: number | null
  cajaMovimientoId: number | null
  bancoCuentaId: number | null
  bancoMovimientoId: number | null
}

type DatosContrapartida = {
  metodo: string
  cajaSesionId?: number | null
  bancoCuentaId?: number | null
  montoCent: number
  docTipo: string
  docId: number
  descripcion: string
  referencia?: string
  direccion: Direccion
}

const salidasBanco = new Set(['RETIRO', 'CHEQUE', 'CARGO'])

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

function num(fila: Fila | undefined, campo: string): number {
  return Number(fila?.[campo] ?? 0)
}

function referencia(input: ReferenciaFinanzasInput): { id: number; tipo: 'DOCUMENTO' | 'RECIBO' | 'PAGO' } {
  return typeof input === 'number'
    ? { id: input, tipo: 'DOCUMENTO' }
    : { id: Number(input.id), tipo: input.tipo ?? 'DOCUMENTO' }
}

function norm(filtro?: FinanzasFiltroInput | MovimientosBancoFiltroInput | SesionesCajaFiltroInput): FinanzasFiltro {
  return { ...(filtro ?? {}), limite: filtro?.limite ?? 300 } as FinanzasFiltro
}

function sumarFecha(fecha: string, frecuencia: string): string {
  const fechaActual = new Date(`${fecha}T00:00:00Z`)
  if (frecuencia === 'SEMANAL') fechaActual.setUTCDate(fechaActual.getUTCDate() + 7)
  else if (frecuencia === 'MENSUAL') fechaActual.setUTCMonth(fechaActual.getUTCMonth() + 1)
  else if (frecuencia === 'TRIMESTRAL') fechaActual.setUTCMonth(fechaActual.getUTCMonth() + 3)
  else fechaActual.setUTCFullYear(fechaActual.getUTCFullYear() + 1)
  return fechaActual.toISOString().slice(0, 10)
}

/**
 * Finanzas de la Fase 8. Todo importe se mueve en centavos enteros dentro de una
 * transacción; ningún saldo cacheado se modifica fuera del servicio.
 */
export function createFinanzasService(db: Db) {
  function tiene(ctx: SessionContext, ...permisos: string[]): boolean {
    return permisos.some((permiso) => ctx.permisos.includes(permiso))
  }

  function exigir(ctx: SessionContext, ...permisos: string[]): void {
    if (!tiene(ctx, ...permisos)) throw errors.forbidden()
  }

  function audit(
    ctx: SessionContext, operacion: Operacion, entidad: string, id: number | null,
    antes: unknown = null, despues: unknown = null
  ): void {
    writeAudit(
      db,
      { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
      operacion, entidad, id, antes, despues
    )
  }

  /** Contrapartida real del dinero: caja, banco o consumo de un anticipo. */
  function registrarContrapartida(ctx: SessionContext, dato: DatosContrapartida): Contrapartida {
    const vacio: Contrapartida = {
      cajaSesionId: null, cajaMovimientoId: null, bancoCuentaId: null, bancoMovimientoId: null
    }
    if (dato.metodo === 'EFECTIVO') {
      const sesionId = dato.cajaSesionId ?? num(aux.getSesionAbierta(db, ctx.empresaId), 'id')
      if (!sesionId) throw errors.conflict('No hay una sesión de caja abierta para este movimiento.')
      const sesion = aux.getSesion(db, ctx.empresaId, sesionId)
      if (!sesion || sesion.estado !== 'ABIERTA') throw errors.conflict('La sesión de caja indicada no está abierta.')
      const cajaMovimientoId = aux.movimientoCaja(db, {
        empresaId: ctx.empresaId,
        cajaSesionId: sesionId,
        cajaId: num(sesion, 'cajaId'),
        tipo: dato.direccion,
        metodo: 'EFECTIVO',
        montoCent: dato.montoCent,
        docTipo: dato.docTipo,
        docId: dato.docId,
        descripcion: dato.descripcion,
        usuarioId: ctx.userId
      })
      return { ...vacio, cajaSesionId: sesionId, cajaMovimientoId }
    }

    const cuentaId = dato.bancoCuentaId ?? 0
    const cuenta = fin.getCuentaBanco(db, ctx.empresaId, cuentaId)
    if (!cuenta || Number(cuenta.activa) !== 1) throw errors.notFound('Cuenta bancaria')
    const tipoBanco = dato.direccion === 'INGRESO'
      ? (dato.metodo === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'DEPOSITO')
      : (dato.metodo === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : dato.metodo === 'CHEQUE' ? 'CHEQUE' : 'RETIRO')
    const bancoMovimientoId = fin.insertarMovimientoBanco(db, {
      empresaId: ctx.empresaId,
      cuentaId,
      fecha: hoy(),
      tipo: tipoBanco,
      montoCent: Math.abs(dato.montoCent),
      referencia: dato.referencia ?? '',
      docTipo: dato.docTipo,
      docId: dato.docId,
      descripcion: dato.descripcion,
      usuarioId: ctx.userId
    })
    fin.ajustarSaldoCuenta(
      db, ctx.empresaId, cuentaId,
      dato.direccion === 'INGRESO' ? dato.montoCent : -dato.montoCent
    )
    return { ...vacio, bancoCuentaId: cuentaId, bancoMovimientoId }
  }

  function reversarContrapartida(
    ctx: SessionContext, contrapartida: Contrapartida, direccionOriginal: Direccion,
    montoCent: number, docTipo: string, docId: number, descripcion: string
  ): void {
    const direccionContraria: Direccion = direccionOriginal === 'INGRESO' ? 'EGRESO' : 'INGRESO'
    if (contrapartida.cajaMovimientoId && contrapartida.cajaSesionId) {
      const sesion = aux.getSesion(db, ctx.empresaId, contrapartida.cajaSesionId)
      if (sesion) {
        aux.movimientoCaja(db, {
          empresaId: ctx.empresaId,
          cajaSesionId: contrapartida.cajaSesionId,
          cajaId: num(sesion, 'cajaId'),
          tipo: direccionContraria,
          metodo: 'EFECTIVO',
          montoCent,
          docTipo,
          docId,
          descripcion,
          usuarioId: ctx.userId
        })
      }
    }
    if (contrapartida.bancoMovimientoId && contrapartida.bancoCuentaId) {
      const tipoBanco = direccionContraria === 'INGRESO' ? 'DEPOSITO' : 'RETIRO'
      fin.insertarMovimientoBanco(db, {
        empresaId: ctx.empresaId,
        cuentaId: contrapartida.bancoCuentaId,
        fecha: hoy(),
        tipo: tipoBanco,
        montoCent: Math.abs(montoCent),
        referencia: '',
        docTipo,
        docId,
        descripcion,
        usuarioId: ctx.userId
      })
      fin.ajustarSaldoCuenta(
        db, ctx.empresaId, contrapartida.bancoCuentaId,
        direccionContraria === 'INGRESO' ? montoCent : -montoCent
      )
    }
  }

  function consumirAnticipo(
    ctx: SessionContext, anticipoId: number, tipo: 'CLIENTE' | 'PROVEEDOR',
    entidadId: number, montoCent: number
  ): void {
    const anticipo = fin.getAnticipo(db, ctx.empresaId, anticipoId, tipo)
    if (!anticipo || num(anticipo, 'entidadId') !== entidadId || anticipo.estado === 'ANULADO') {
      throw errors.notFound('Anticipo')
    }
    if (num(anticipo, 'saldoCent') < montoCent) {
      throw errors.conflict('El anticipo seleccionado no tiene saldo suficiente.')
    }
    fin.ajustarAnticipo(db, ctx.empresaId, anticipoId, -montoCent)
  }

  function datosImpresion(ctx: SessionContext, input: ImprimirFinanzasInput, tipo: TipoFinanzas) {
    exigir(ctx, `${tipo}.imprimir`)
    const permiso = {
      cxc: 'cxc.consultar', cxp: 'cxp.consultar',
      bancos: 'bancos.consultar', cajas: 'cajas.consultar'
    }[tipo]
    if (!tiene(ctx, permiso)) throw errors.forbidden()
    const id = Number(input.id)
    const formato = input.formato ?? 'CARTA'
    const empresa = getEmpresa(db, ctx.empresaId) ?? {}
    if (tipo === 'cxc') {
      const documento = input.tipo === 'RECIBO' ? undefined : fin.getCxc(db, ctx.empresaId, id)
      if (documento) {
        return {
          formato, empresa, documento,
          lineas: fin.listarAplicacionesPorDocumentoCxc(db, ctx.empresaId, id)
        }
      }
      const recibo = fin.getReciboCxc(db, ctx.empresaId, id)
      if (!recibo) throw errors.notFound('Recibo')
      return {
        formato, empresa, documento: recibo,
        lineas: fin.listarAplicacionesCxc(db, ctx.empresaId, id)
      }
    }
    if (tipo === 'cxp') {
      const documento = input.tipo === 'PAGO' ? undefined : fin.getCxp(db, ctx.empresaId, id)
      if (documento) {
        return {
          formato, empresa, documento,
          lineas: fin.listarAplicacionesPorDocumentoCxp(db, ctx.empresaId, id)
        }
      }
      const pago = fin.getPagoCxp(db, ctx.empresaId, id)
      if (!pago) throw errors.notFound('Pago')
      return {
        formato, empresa, documento: pago,
        lineas: fin.listarAplicacionesCxp(db, ctx.empresaId, id)
      }
    }
    if (tipo === 'bancos') {
      const movimiento = fin.getMovimientoBanco(db, ctx.empresaId, id)
      if (movimiento) return { formato, empresa, documento: movimiento, lineas: [movimiento] }
      const conciliacion = fin.getConciliacionFin(db, ctx.empresaId, id)
      if (!conciliacion) throw errors.notFound('Movimiento bancario')
      return { formato, empresa, documento: conciliacion, lineas: [] }
    }
    const sesion = aux.getSesion(db, ctx.empresaId, id)
    if (!sesion) throw errors.notFound('Sesión de caja')
    return {
      formato, empresa, documento: sesion,
      lineas: aux.listarMovimientosCaja(db, ctx.empresaId, id)
    }
  }

  async function exportar(
    ctx: SessionContext, input: ExportarFinanzasInput, tipo: 'cxc' | 'cxp'
  ) {
    exigir(ctx, `${tipo}.exportar`)
    const filtro = norm(input?.filtro)
    const filas = tipo === 'cxc'
      ? fin.listarCxc(db, ctx.empresaId, filtro)
      : fin.listarCxp(db, ctx.empresaId, filtro)
    const columnas = [
      { header: 'Número', key: 'numeroDocumento', width: 22 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Vencimiento', key: 'vencimiento', width: 14 },
      { header: tipo === 'cxc' ? 'Cliente' : 'Proveedor', key: 'entidad', width: 32 },
      { header: 'RNC/Cédula', key: 'rnc', width: 20 },
      { header: 'Estado', key: 'estado', width: 16 },
      { header: 'Monto', key: 'monto', width: 16 },
      { header: 'Saldo', key: 'saldo', width: 16 },
      { header: 'Días', key: 'antiguedadDias', width: 10 }
    ]
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(tipo === 'cxc' ? 'Cuentas por cobrar' : 'Cuentas por pagar')
    ws.columns = columnas
    ws.getRow(1).font = { bold: true }
    for (const fila of filas) {
      ws.addRow({
        ...fila,
        entidad: fila.clienteNombre ?? fila.proveedorNombre ?? '',
        rnc: fila.clienteRnc ?? fila.proveedorRnc ?? '',
        monto: num(fila, 'montoCent') / 100,
        saldo: num(fila, 'saldoCent') / 100
      })
    }
    const buffer = await wb.xlsx.writeBuffer()
    return {
      filename: `${tipo}_${hoy()}.xlsx`,
      base64: Buffer.from(buffer).toString('base64')
    }
  }

  return {
    catalogos(ctx: SessionContext) {
      exigir(
        ctx, 'cxc.consultar', 'cxp.consultar', 'bancos.consultar',
        'cajas.consultar', 'gastos.consultar'
      )
      const catalogos = fin.catalogosFin(db, ctx.empresaId)
      return {
        ...catalogos,
        metodosPago: [...metodosPagoFinanzas],
        formatosImpresion: [...formatosImpresion]
      }
    },

    // ------------------------------- CxC ------------------------------------

    cxcDocumentos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'cxc.consultar')
      return fin.listarCxc(db, ctx.empresaId, norm(filtro))
    },

    cxcRecibos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'cxc.consultar')
      return fin.listarRecibosCxc(db, ctx.empresaId, norm(filtro))
    },

    cxcDetalle(ctx: SessionContext, input: ReferenciaFinanzasInput) {
      exigir(ctx, 'cxc.consultar')
      const { id, tipo } = referencia(input)
      if (tipo === 'RECIBO') {
        const recibo = fin.getReciboCxc(db, ctx.empresaId, id)
        if (!recibo) throw errors.notFound('Recibo')
        return {
          cabecera: recibo,
          aplicaciones: fin.listarAplicacionesCxc(db, ctx.empresaId, id),
          movimientos: fin.movimientosCxcPorRecibo(db, ctx.empresaId, String(recibo.numero)),
          recibos: []
        }
      }
      const documento = fin.getCxc(db, ctx.empresaId, id)
      if (documento) {
        const aplicaciones = fin.listarAplicacionesPorDocumentoCxc(db, ctx.empresaId, id)
        const reciboIds = [...new Set(aplicaciones.map((a) => num(a, 'reciboId')))]
        return {
          cabecera: documento,
          aplicaciones,
          movimientos: fin.movimientosCxcPorDocumento(db, ctx.empresaId, id),
          recibos: reciboIds.map((reciboId) => fin.getReciboCxc(db, ctx.empresaId, reciboId)).filter(Boolean)
        }
      }
      const recibo = fin.getReciboCxc(db, ctx.empresaId, id)
      if (!recibo) throw errors.notFound('Documento de CxC')
      return {
        cabecera: recibo,
        aplicaciones: fin.listarAplicacionesCxc(db, ctx.empresaId, id),
        movimientos: fin.movimientosCxcPorRecibo(db, ctx.empresaId, String(recibo.numero)),
        recibos: []
      }
    },

    cxcReciboCrear(ctx: SessionContext, input: CxcReciboCrearInput) {
      exigir(ctx, 'cxc.crear')
      const clienteId = Number(input.clienteId)
      const cliente = fin.getClienteFin(db, ctx.empresaId, clienteId)
      if (!cliente) throw errors.notFound('Cliente')
      const montoCent = Number(input.montoCent)
      const metodo = input.metodo ?? 'EFECTIVO'
      const fecha = input.fecha ?? hoy()
      for (const aplicacion of input.aplicaciones ?? []) {
        const documento = fin.getCxc(db, ctx.empresaId, Number(aplicacion.cxcDocumentoId))
        if (!documento || num(documento, 'clienteId') !== clienteId || documento.estado === 'ANULADO') {
          throw errors.conflict('Una de las facturas seleccionadas no pertenece al cliente o está anulada.')
        }
        if (num(documento, 'saldoCent') < Number(aplicacion.montoCent)) {
          throw errors.conflict(`La factura ${documento.numeroDocumento} no tiene saldo suficiente.`)
        }
      }
      return db.transaction(() => {
        const numero = nextSerieNumber(db, ctx.empresaId, 'RECIBO_INGRESO')
        let contrapartida: Contrapartida = {
          cajaSesionId: null, cajaMovimientoId: null, bancoCuentaId: null, bancoMovimientoId: null
        }
        if (input.anticipoId) {
          consumirAnticipo(ctx, Number(input.anticipoId), 'CLIENTE', clienteId, montoCent)
        } else {
          contrapartida = registrarContrapartida(ctx, {
            metodo,
            cajaSesionId: input.cajaSesionId,
            bancoCuentaId: input.bancoCuentaId,
            montoCent,
            docTipo: 'RECIBO_INGRESO',
            docId: 0,
            descripcion: `Cobro ${numero} - ${cliente.nombre}`,
            referencia: input.referencia ?? '',
            direccion: 'INGRESO'
          })
        }
        const reciboId = fin.insertarReciboCxc(db, {
          empresaId: ctx.empresaId,
          numero,
          clienteId,
          clienteNombre: String(cliente.nombre),
          fecha,
          montoCent,
          metodo,
          referencia: input.referencia ?? '',
          anticipoId: input.anticipoId ? Number(input.anticipoId) : null,
          cajaSesionId: contrapartida.cajaSesionId,
          cajaMovimientoId: contrapartida.cajaMovimientoId,
          bancoCuentaId: contrapartida.bancoCuentaId,
          bancoMovimientoId: contrapartida.bancoMovimientoId,
          comentarios: input.comentarios ?? '',
          usuarioId: ctx.userId
        })
        // El movimiento de caja/banco queda ligado al recibo recién creado.
        if (contrapartida.cajaMovimientoId) {
          fin.ligarMovimientoCaja(db, ctx.empresaId, contrapartida.cajaMovimientoId, reciboId)
        }
        if (contrapartida.bancoMovimientoId) {
          fin.ligarMovimientoBanco(db, ctx.empresaId, contrapartida.bancoMovimientoId, reciboId)
        }
        for (const aplicacion of input.aplicaciones ?? []) {
          const documentoId = Number(aplicacion.cxcDocumentoId)
          const montoAplicado = Number(aplicacion.montoCent)
          fin.insertarAplicacionCxc(db, ctx.empresaId, reciboId, documentoId, montoAplicado)
          fin.aplicarCxc(db, ctx.empresaId, documentoId, montoAplicado)
          const documento = fin.getCxc(db, ctx.empresaId, documentoId)
          aux.ajustarBalanceCliente(db, ctx.empresaId, clienteId, -montoAplicado)
          aux.movimientoCxc(db, {
            empresaId: ctx.empresaId,
            clienteId,
            cxcDocumentoId: documentoId,
            docVentaId: num(documento, 'docVentaId'),
            tipo: 'ABONO',
            montoCent: montoAplicado,
            referencia: numero,
            usuarioId: ctx.userId
          })
        }
        audit(ctx, 'CREAR', 'cxc_recibos', reciboId, null, {
          numero, clienteId, montoCent, metodo, aplicaciones: input.aplicaciones?.length ?? 0
        })
        return { id: reciboId, numero }
      })()
    },

    cxcReciboAnular(ctx: SessionContext, input: AnularFinanzasInput) {
      exigir(ctx, 'cxc.anular')
      const id = Number(input.id)
      const recibo = fin.getReciboCxc(db, ctx.empresaId, id)
      if (!recibo || recibo.estado === 'ANULADO') throw errors.conflict('El recibo ya está anulado o no existe.')
      return db.transaction(() => {
        const aplicaciones = fin.listarAplicacionesCxc(db, ctx.empresaId, id)
        let total = 0
        for (const aplicacion of aplicaciones) {
          const documentoId = num(aplicacion, 'cxcDocumentoId')
          const monto = num(aplicacion, 'montoCent')
          fin.abonarCxc(db, ctx.empresaId, documentoId, monto)
          aux.ajustarBalanceCliente(db, ctx.empresaId, num(recibo, 'clienteId'), monto)
          const documento = fin.getCxc(db, ctx.empresaId, documentoId)
          aux.movimientoCxc(db, {
            empresaId: ctx.empresaId,
            clienteId: num(recibo, 'clienteId'),
            cxcDocumentoId: documentoId,
            docVentaId: num(documento, 'docVentaId'),
            tipo: 'ANULACION',
            montoCent: monto,
            referencia: `Anulación ${recibo.numero}: ${input.motivo}`,
            usuarioId: ctx.userId
          })
          total += monto
        }
        if (recibo.anticipoId) {
          fin.ajustarAnticipo(db, ctx.empresaId, num(recibo, 'anticipoId'), total)
        } else {
          reversarContrapartida(ctx, {
            cajaSesionId: recibo.cajaSesionId ? num(recibo, 'cajaSesionId') : null,
            cajaMovimientoId: recibo.cajaMovimientoId ? num(recibo, 'cajaMovimientoId') : null,
            bancoCuentaId: recibo.bancoCuentaId ? num(recibo, 'bancoCuentaId') : null,
            bancoMovimientoId: recibo.bancoMovimientoId ? num(recibo, 'bancoMovimientoId') : null
          }, 'INGRESO', num(recibo, 'montoCent'), 'ANULACION_RECIBO', id,
          `Reversa por anulación del recibo ${recibo.numero}`)
        }
        fin.anularReciboCxc(db, ctx.empresaId, id)
        audit(ctx, 'ANULAR', 'cxc_recibos', id, { estado: recibo.estado }, {
          estado: 'ANULADO', motivo: input.motivo
        })
        return { id, estado: 'ANULADO' }
      })()
    },

    cxcAnticipos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'cxc.consultar')
      return fin.listarAnticipos(db, ctx.empresaId, 'CLIENTE', norm(filtro))
    },

    // ------------------------------- CxP ------------------------------------

    cxpDocumentos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'cxp.consultar')
      return fin.listarCxp(db, ctx.empresaId, norm(filtro))
    },

    cxpPagos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'cxp.consultar')
      return fin.listarPagosCxp(db, ctx.empresaId, norm(filtro))
    },

    cxpDetalle(ctx: SessionContext, input: ReferenciaFinanzasInput) {
      exigir(ctx, 'cxp.consultar')
      const { id, tipo } = referencia(input)
      if (tipo === 'PAGO') {
        const pago = fin.getPagoCxp(db, ctx.empresaId, id)
        if (!pago) throw errors.notFound('Pago')
        return {
          cabecera: pago,
          aplicaciones: fin.listarAplicacionesCxp(db, ctx.empresaId, id),
          movimientos: fin.movimientosCxpPorPago(db, ctx.empresaId, String(pago.numero)),
          pagos: []
        }
      }
      const documento = fin.getCxp(db, ctx.empresaId, id)
      if (documento) {
        const aplicaciones = fin.listarAplicacionesPorDocumentoCxp(db, ctx.empresaId, id)
        const pagoIds = [...new Set(aplicaciones.map((a) => num(a, 'pagoId')))]
        return {
          cabecera: documento,
          aplicaciones,
          movimientos: fin.movimientosCxpPorDocumento(db, ctx.empresaId, id),
          pagos: pagoIds.map((pagoId) => fin.getPagoCxp(db, ctx.empresaId, pagoId)).filter(Boolean)
        }
      }
      const pago = fin.getPagoCxp(db, ctx.empresaId, id)
      if (!pago) throw errors.notFound('Documento de CxP')
      return {
        cabecera: pago,
        aplicaciones: fin.listarAplicacionesCxp(db, ctx.empresaId, id),
        movimientos: fin.movimientosCxpPorPago(db, ctx.empresaId, String(pago.numero)),
        pagos: []
      }
    },

    cxpPagoCrear(ctx: SessionContext, input: CxpPagoCrearInput) {
      exigir(ctx, 'cxp.crear')
      const proveedorId = Number(input.proveedorId)
      const proveedor = fin.getProveedorFin(db, ctx.empresaId, proveedorId)
      if (!proveedor) throw errors.notFound('Proveedor')
      const montoCent = Number(input.montoCent)
      const metodo = input.metodo ?? 'EFECTIVO'
      const fecha = input.fecha ?? hoy()
      for (const aplicacion of input.aplicaciones ?? []) {
        const documento = fin.getCxp(db, ctx.empresaId, Number(aplicacion.cxpDocumentoId))
        if (!documento || num(documento, 'proveedorId') !== proveedorId || documento.estado === 'ANULADO') {
          throw errors.conflict('Una de las facturas seleccionadas no pertenece al proveedor o está anulada.')
        }
        if (num(documento, 'saldoCent') < Number(aplicacion.montoCent)) {
          throw errors.conflict(`La factura ${documento.numeroDocumento} no tiene saldo suficiente.`)
        }
      }
      return db.transaction(() => {
        const numero = nextSerieNumber(db, ctx.empresaId, 'PAGO_CXP')
        let contrapartida: Contrapartida = {
          cajaSesionId: null, cajaMovimientoId: null, bancoCuentaId: null, bancoMovimientoId: null
        }
        if (input.anticipoId) {
          consumirAnticipo(ctx, Number(input.anticipoId), 'PROVEEDOR', proveedorId, montoCent)
        } else {
          contrapartida = registrarContrapartida(ctx, {
            metodo,
            cajaSesionId: input.cajaSesionId,
            bancoCuentaId: input.bancoCuentaId,
            montoCent,
            docTipo: 'PAGO_CXP',
            docId: 0,
            descripcion: `Pago ${numero} - ${proveedor.nombre_comercial}`,
            referencia: input.referencia ?? '',
            direccion: 'EGRESO'
          })
        }
        const pagoId = fin.insertarPagoCxp(db, {
          empresaId: ctx.empresaId,
          numero,
          proveedorId,
          proveedorNombre: String(proveedor.nombre_comercial),
          fecha,
          montoCent,
          metodo,
          referencia: input.referencia ?? '',
          anticipoId: input.anticipoId ? Number(input.anticipoId) : null,
          cajaSesionId: contrapartida.cajaSesionId,
          cajaMovimientoId: contrapartida.cajaMovimientoId,
          bancoCuentaId: contrapartida.bancoCuentaId,
          bancoMovimientoId: contrapartida.bancoMovimientoId,
          comentarios: input.comentarios ?? '',
          usuarioId: ctx.userId
        })
        if (contrapartida.cajaMovimientoId) {
          fin.ligarMovimientoCaja(db, ctx.empresaId, contrapartida.cajaMovimientoId, pagoId)
        }
        if (contrapartida.bancoMovimientoId) {
          fin.ligarMovimientoBanco(db, ctx.empresaId, contrapartida.bancoMovimientoId, pagoId)
        }
        for (const aplicacion of input.aplicaciones ?? []) {
          const documentoId = Number(aplicacion.cxpDocumentoId)
          const montoAplicado = Number(aplicacion.montoCent)
          fin.insertarAplicacionCxp(db, ctx.empresaId, pagoId, documentoId, montoAplicado)
          const documento = fin.getCxp(db, ctx.empresaId, documentoId)
          cxp.abonarCxp(db, ctx.empresaId, num(documento, 'docCompraId'), montoAplicado)
          cxp.ajustarBalanceProveedor(db, ctx.empresaId, proveedorId, -montoAplicado)
          cxp.movimientoCxp(db, {
            empresaId: ctx.empresaId,
            proveedorId,
            cxpDocumentoId: documentoId,
            docCompraId: num(documento, 'docCompraId'),
            tipo: 'ABONO',
            montoCent: montoAplicado,
            referencia: numero,
            usuarioId: ctx.userId
          })
        }
        audit(ctx, 'CREAR', 'cxp_pagos', pagoId, null, {
          numero, proveedorId, montoCent, metodo, aplicaciones: input.aplicaciones?.length ?? 0
        })
        return { id: pagoId, numero }
      })()
    },

    cxpPagoAnular(ctx: SessionContext, input: AnularFinanzasInput) {
      exigir(ctx, 'cxp.anular')
      const id = Number(input.id)
      const pago = fin.getPagoCxp(db, ctx.empresaId, id)
      if (!pago || pago.estado === 'ANULADO') throw errors.conflict('El pago ya está anulado o no existe.')
      return db.transaction(() => {
        const aplicaciones = fin.listarAplicacionesCxp(db, ctx.empresaId, id)
        let total = 0
        for (const aplicacion of aplicaciones) {
          const documentoId = num(aplicacion, 'cxpDocumentoId')
          const monto = num(aplicacion, 'montoCent')
          const documento = fin.getCxp(db, ctx.empresaId, documentoId)
          const docCompraId = num(documento, 'docCompraId')
          fin.abonarCxpDocumento(db, ctx.empresaId, docCompraId, monto)
          cxp.ajustarBalanceProveedor(db, ctx.empresaId, num(pago, 'proveedorId'), monto)
          cxp.movimientoCxp(db, {
            empresaId: ctx.empresaId,
            proveedorId: num(pago, 'proveedorId'),
            cxpDocumentoId: documentoId,
            docCompraId,
            tipo: 'ANULACION',
            montoCent: monto,
            referencia: `Anulación ${pago.numero}: ${input.motivo}`,
            usuarioId: ctx.userId
          })
          total += monto
        }
        if (pago.anticipoId) {
          fin.ajustarAnticipo(db, ctx.empresaId, num(pago, 'anticipoId'), total)
        } else {
          reversarContrapartida(ctx, {
            cajaSesionId: pago.cajaSesionId ? num(pago, 'cajaSesionId') : null,
            cajaMovimientoId: pago.cajaMovimientoId ? num(pago, 'cajaMovimientoId') : null,
            bancoCuentaId: pago.bancoCuentaId ? num(pago, 'bancoCuentaId') : null,
            bancoMovimientoId: pago.bancoMovimientoId ? num(pago, 'bancoMovimientoId') : null
          }, 'EGRESO', num(pago, 'montoCent'), 'ANULACION_PAGO', id,
          `Reversa por anulación del pago ${pago.numero}`)
        }
        fin.anularPagoCxp(db, ctx.empresaId, id)
        audit(ctx, 'ANULAR', 'cxp_pagos', id, { estado: pago.estado }, {
          estado: 'ANULADO', motivo: input.motivo
        })
        return { id, estado: 'ANULADO' }
      })()
    },

    cxpAnticipos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'cxp.consultar')
      return fin.listarAnticipos(db, ctx.empresaId, 'PROVEEDOR', norm(filtro))
    },

    anticipoCrear(ctx: SessionContext, input: AnticipoCrearInput) {
      const tipo = input.tipo
      exigir(ctx, tipo === 'CLIENTE' ? 'cxc.crear' : 'cxp.crear')
      const entidadId = Number(input.entidadId)
      const entidad = tipo === 'CLIENTE'
        ? fin.getClienteFin(db, ctx.empresaId, entidadId)
        : fin.getProveedorFin(db, ctx.empresaId, entidadId)
      if (!entidad) throw errors.notFound(tipo === 'CLIENTE' ? 'Cliente' : 'Proveedor')
      const montoCent = Number(input.montoCent)
      const metodo = input.metodo ?? 'EFECTIVO'
      const direccion: Direccion = tipo === 'CLIENTE' ? 'INGRESO' : 'EGRESO'
      return db.transaction(() => {
        const contrapartida = registrarContrapartida(ctx, {
          metodo,
          cajaSesionId: input.cajaSesionId,
          bancoCuentaId: input.bancoCuentaId,
          montoCent,
          docTipo: `ANTICIPO_${tipo}`,
          docId: 0,
          descripcion: `Anticipo de ${tipo.toLowerCase()} - ${tipo === 'CLIENTE' ? entidad.nombre : entidad.nombre_comercial}`,
          referencia: input.referencia ?? '',
          direccion
        })
        const anticipoId = fin.insertarAnticipo(db, {
          empresaId: ctx.empresaId,
          tipo,
          entidadId,
          fecha: input.fecha ?? hoy(),
          montoCent,
          referencia: input.referencia ?? '',
          cajaMovimientoId: contrapartida.cajaMovimientoId,
          bancoMovimientoId: contrapartida.bancoMovimientoId,
          usuarioId: ctx.userId
        })
        if (contrapartida.cajaMovimientoId) {
          fin.ligarMovimientoCaja(db, ctx.empresaId, contrapartida.cajaMovimientoId, anticipoId)
        }
        if (contrapartida.bancoMovimientoId) {
          fin.ligarMovimientoBanco(db, ctx.empresaId, contrapartida.bancoMovimientoId, anticipoId)
        }
        audit(ctx, 'CREAR', 'anticipos', anticipoId, null, {
          tipo, entidadId, montoCent, metodo
        })
        return { id: anticipoId }
      })()
    },

    // ------------------------------ Bancos ----------------------------------

    bancosCuentas(ctx: SessionContext) {
      exigir(ctx, 'bancos.consultar')
      return fin.listarCuentasBanco(db, ctx.empresaId)
    },

    bancosCuentaCrear(ctx: SessionContext, input: BancoCuentaInput) {
      exigir(ctx, 'bancos.crear')
      return db.transaction(() => {
        const id = fin.insertarCuentaBanco(db, {
          empresaId: ctx.empresaId,
          codigo: String(input.codigo),
          nombre: String(input.nombre),
          banco: input.banco ?? '',
          numeroCuenta: input.numeroCuenta ?? '',
          tipo: input.tipo ?? 'CORRIENTE',
          saldoInicialCent: Number(input.saldoInicialCent ?? 0),
          activa: input.activa ?? true
        })
        audit(ctx, 'CREAR', 'bancos_cuentas', id, null, {
          codigo: input.codigo, nombre: input.nombre, saldoInicialCent: input.saldoInicialCent ?? 0
        })
        return { id }
      })()
    },

    bancosMovimientos(ctx: SessionContext, filtro?: MovimientosBancoFiltroInput) {
      exigir(ctx, 'bancos.consultar')
      return fin.listarMovimientosBanco(db, ctx.empresaId, {
        ...norm(filtro), cuentaId: filtro?.cuentaId
      } as MovimientosBancoFiltro)
    },

    bancosMovimientoCrear(ctx: SessionContext, input: BancoMovimientoInput) {
      exigir(ctx, 'bancos.crear')
      const cuentaId = Number(input.cuentaId)
      const cuenta = fin.getCuentaBanco(db, ctx.empresaId, cuentaId)
      if (!cuenta || Number(cuenta.activa) !== 1) throw errors.notFound('Cuenta bancaria')
      const tipo = String(input.tipo)
      const montoAbsoluto = Math.abs(Number(input.montoCent))
      const delta = salidasBanco.has(tipo)
        ? -montoAbsoluto
        : (tipo === 'DEPOSITO' || tipo === 'INTERES') ? montoAbsoluto : Number(input.montoCent)
      if (delta === 0) throw errors.validation('El monto del movimiento no puede ser cero.')
      return db.transaction(() => {
        const id = fin.insertarMovimientoBanco(db, {
          empresaId: ctx.empresaId,
          cuentaId,
          fecha: input.fecha ?? hoy(),
          tipo,
          montoCent: delta,
          referencia: input.referencia ?? '',
          docTipo: input.docTipo ?? '',
          docId: input.docId ?? null,
          descripcion: input.descripcion ?? '',
          usuarioId: ctx.userId
        })
        fin.ajustarSaldoCuenta(db, ctx.empresaId, cuentaId, delta)
        audit(ctx, 'CREAR', 'bancos_movimientos', id, null, {
          cuentaId, tipo, montoCent: delta
        })
        return { id }
      })()
    },

    bancosMovimientoAnular(ctx: SessionContext, input: AnularFinanzasInput) {
      exigir(ctx, 'bancos.anular')
      const id = Number(input.id)
      const movimiento = fin.getMovimientoBanco(db, ctx.empresaId, id)
      if (!movimiento || num(movimiento, 'conciliado') === 1) {
        throw errors.conflict('El movimiento no existe o ya está conciliado.')
      }
      return db.transaction(() => {
        const original = num(movimiento, 'montoCent')
        const compensacionId = fin.insertarMovimientoBanco(db, {
          empresaId: ctx.empresaId,
          cuentaId: num(movimiento, 'cuentaId'),
          fecha: hoy(),
          tipo: 'AJUSTE',
          montoCent: -original,
          referencia: `Anulación movimiento ${id}`,
          docTipo: 'ANULACION_BANCO',
          docId: id,
          descripcion: `Reversa por anulación: ${input.motivo}`,
          usuarioId: ctx.userId
        })
        fin.ajustarSaldoCuenta(db, ctx.empresaId, num(movimiento, 'cuentaId'), -original)
        audit(ctx, 'ANULAR', 'bancos_movimientos', id, movimiento, {
          anulado: true, compensacionId, motivo: input.motivo
        })
        return { id, compensacionId }
      })()
    },

    bancosConciliaciones(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'bancos.consultar')
      return fin.listarConciliaciones(db, ctx.empresaId, norm(filtro))
    },

    bancosConciliacionCrear(ctx: SessionContext, input: BancoConciliacionInput) {
      exigir(ctx, 'bancos.crear')
      const cuentaId = Number(input.cuentaId)
      const cuenta = fin.getCuentaBanco(db, ctx.empresaId, cuentaId)
      if (!cuenta) throw errors.notFound('Cuenta bancaria')
      const movimientoIds = [...new Set((input.movimientoIds ?? []).map(Number))]
      for (const movimientoId of movimientoIds) {
        const movimiento = fin.getMovimientoBanco(db, ctx.empresaId, movimientoId)
        if (!movimiento || num(movimiento, 'cuentaId') !== cuentaId || num(movimiento, 'conciliado') === 1) {
          throw errors.conflict('Uno de los movimientos no pertenece a la cuenta o ya fue conciliado.')
        }
      }
      return db.transaction(() => {
        const saldoLibroCent = num(cuenta, 'saldoCent')
        const saldoBancoCent = Number(input.saldoBancoCent)
        const id = fin.insertarConciliacion(db, {
          empresaId: ctx.empresaId,
          cuentaId,
          fecha: input.fecha ?? hoy(),
          periodoDesde: input.periodoDesde ?? '',
          periodoHasta: input.periodoHasta ?? '',
          saldoBancoCent,
          saldoLibroCent,
          diferenciaCent: saldoBancoCent - saldoLibroCent,
          observaciones: input.observaciones ?? '',
          usuarioId: ctx.userId
        })
        for (const movimientoId of movimientoIds) {
          fin.insertarLineaConciliacion(db, ctx.empresaId, id, movimientoId)
          fin.marcarMovimientoConciliado(db, ctx.empresaId, movimientoId)
        }
        audit(ctx, 'CREAR', 'bancos_conciliaciones', id, null, {
          cuentaId, saldoBancoCent, saldoLibroCent, movimientoIds
        })
        return {
          id,
          diferenciaCent: saldoBancoCent - saldoLibroCent,
          conciliados: movimientoIds.length
        }
      })()
    },

    // ------------------------------- Caja -----------------------------------

    cajasSesiones(ctx: SessionContext, filtro?: SesionesCajaFiltroInput) {
      exigir(ctx, 'cajas.consultar')
      return fin.listarSesionesCaja(db, ctx.empresaId, {
        ...norm(filtro), cajaId: filtro?.cajaId
      } as SesionesCajaFiltro)
    },

    cajasDetalle(ctx: SessionContext, id: number) {
      exigir(ctx, 'cajas.consultar')
      const sesion = aux.getSesion(db, ctx.empresaId, id)
      if (!sesion) throw errors.notFound('Sesión de caja')
      return {
        cabecera: sesion,
        movimientos: aux.listarMovimientosCaja(db, ctx.empresaId, id),
        teoricoCent: aux.saldoTeorico(db, ctx.empresaId, sesion)
      }
    },

    cajasAbrir(ctx: SessionContext, input: AbrirCajaFinanzasInput) {
      exigir(ctx, 'cajas.abrir_caja')
      const cajaId = input.cajaId ?? num(aux.getCajaPrincipal(db, ctx.empresaId), 'id')
      if (!cajaId || !aux.getCaja(db, ctx.empresaId, cajaId)) throw errors.notFound('Caja')
      if (aux.getSesionAbierta(db, ctx.empresaId, cajaId)) {
        throw errors.conflict('La caja ya tiene una sesión abierta.')
      }
      const montoCent = Number(input.montoCent ?? 0)
      return db.transaction(() => {
        const id = aux.abrirSesion(db, ctx.empresaId, cajaId, ctx.userId, montoCent, input.observaciones ?? '')
        if (montoCent > 0) {
          aux.movimientoCaja(db, {
            empresaId: ctx.empresaId,
            cajaSesionId: id,
            cajaId,
            tipo: 'INGRESO',
            metodo: 'EFECTIVO',
            montoCent,
            docTipo: 'APERTURA',
            docId: id,
            descripcion: 'Apertura de caja',
            usuarioId: ctx.userId
          })
        }
        audit(ctx, 'CREAR', 'caja_sesiones', id, null, { cajaId, montoCent })
        return { id }
      })()
    },

    cajasCerrar(ctx: SessionContext, input: CerrarCajaFinanzasInput) {
      exigir(ctx, 'cajas.cerrar_caja')
      const id = Number(input.sesionId)
      const sesion = aux.getSesion(db, ctx.empresaId, id)
      if (!sesion || sesion.estado !== 'ABIERTA') throw errors.conflict('La sesión de caja no está abierta.')
      const teoricoCent = aux.saldoTeorico(db, ctx.empresaId, sesion)
      const arqueoEfectivoCent = Number(input.arqueoEfectivoCent)
      const arqueoOtrosCent = Number(input.arqueoOtrosCent ?? 0)
      const arqueoCent = arqueoEfectivoCent + arqueoOtrosCent
      const diferenciaCent = arqueoCent - teoricoCent
      return db.transaction(() => {
        fin.registrarArqueo(db, ctx.empresaId, id, arqueoEfectivoCent, arqueoOtrosCent, ctx.userId)
        aux.cerrarSesion(db, ctx.empresaId, id, arqueoCent, diferenciaCent, input.observaciones ?? '')
        audit(ctx, 'MODIFICAR', 'caja_sesiones', id, { estado: 'ABIERTA' }, {
          estado: 'CERRADA', arqueoCent, teoricoCent, diferenciaCent
        })
        return { id, arqueoCent, teoricoCent, diferenciaCent }
      })()
    },

    cajasMovimientoCrear(ctx: SessionContext, input: MovimientoCajaManualInput) {
      exigir(ctx, 'cajas.crear')
      const sesionId = Number(input.sesionId)
      const sesion = aux.getSesion(db, ctx.empresaId, sesionId)
      if (!sesion || sesion.estado !== 'ABIERTA') throw errors.conflict('La sesión de caja no está abierta.')
      const montoCent = Number(input.montoCent)
      return db.transaction(() => {
        const id = aux.movimientoCaja(db, {
          empresaId: ctx.empresaId,
          cajaSesionId: sesionId,
          cajaId: num(sesion, 'cajaId'),
          tipo: String(input.tipo) as Direccion,
          metodo: input.metodo ?? 'EFECTIVO',
          montoCent,
          docTipo: 'AJUSTE_CAJA',
          docId: sesionId,
          descripcion: String(input.descripcion),
          usuarioId: ctx.userId
        })
        audit(ctx, 'CREAR', 'caja_movimientos', id, null, {
          sesionId, tipo: input.tipo, montoCent
        })
        return { id }
      })()
    },

    // -------------------------- Gastos y comisiones --------------------------

    gastosCategorias(ctx: SessionContext) {
      exigir(ctx, 'gastos.consultar')
      return fin.listarCategoriasGasto(db, ctx.empresaId)
    },

    gastosCategoriaCrear(ctx: SessionContext, input: GastoCategoriaInput) {
      exigir(ctx, 'gastos.crear')
      const id = fin.insertarCategoriaGasto(
        db, ctx.empresaId, String(input.codigo), String(input.nombre), input.activa ?? true
      )
      audit(ctx, 'CREAR', 'gastos_categorias', id, null, { codigo: input.codigo, nombre: input.nombre })
      return { id }
    },

    gastosDocumentos(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'gastos.consultar')
      return fin.listarGastos(db, ctx.empresaId, norm(filtro))
    },

    gastosDetalle(ctx: SessionContext, id: number) {
      exigir(ctx, 'gastos.consultar')
      const gasto = fin.getGasto(db, ctx.empresaId, id)
      if (!gasto) throw errors.notFound('Gasto')
      const movimientos: Fila[] = []
      if (gasto.cajaMovimientoId) {
        const movimiento = fin.getMovimientoCajaFin(db, ctx.empresaId, num(gasto, 'cajaMovimientoId'))
        if (movimiento) movimientos.push(movimiento)
      }
      if (gasto.bancoMovimientoId) {
        const movimiento = fin.getMovimientoBancoFin(db, ctx.empresaId, num(gasto, 'bancoMovimientoId'))
        if (movimiento) movimientos.push(movimiento)
      }
      return { cabecera: gasto, movimientos }
    },

    gastosCrear(ctx: SessionContext, input: GastoCrearInput) {
      exigir(ctx, 'gastos.crear')
      const categoriaId = Number(input.categoriaId)
      if (!fin.getCategoriaGasto(db, ctx.empresaId, categoriaId)) throw errors.notFound('Categoría de gasto')
      if (input.proveedorId && !fin.getProveedorFin(db, ctx.empresaId, Number(input.proveedorId))) {
        throw errors.notFound('Proveedor')
      }
      const montoCent = Number(input.montoCent)
      const impuestoCent = Number(input.impuestoCent ?? 0)
      const totalCent = montoCent + impuestoCent
      return db.transaction(() => {
        const numero = nextSerieNumber(db, ctx.empresaId, 'GASTO')
        const id = fin.insertarGasto(db, {
          empresaId: ctx.empresaId,
          numero,
          categoriaId,
          proveedorId: input.proveedorId ? Number(input.proveedorId) : null,
          fecha: input.fecha ?? hoy(),
          concepto: String(input.concepto),
          montoCent,
          impuestoCent,
          totalCent,
          metodo: input.metodo ?? 'EFECTIVO',
          recurrenteId: input.recurrenteId ? Number(input.recurrenteId) : null,
          cajaSesionId: null,
          cajaMovimientoId: null,
          bancoCuentaId: null,
          bancoMovimientoId: null,
          estado: 'PENDIENTE',
          docReferencia: input.docReferencia ?? '',
          usuarioId: ctx.userId
        })
        audit(ctx, 'CREAR', 'gastos', id, null, {
          numero, categoriaId, totalCent, estado: 'PENDIENTE'
        })
        return { id, numero, estado: 'PENDIENTE' }
      })()
    },

    gastosPagar(ctx: SessionContext, input: GastoPagarInput) {
      exigir(ctx, 'gastos.aprobar')
      const id = Number(input.id)
      const gasto = fin.getGasto(db, ctx.empresaId, id)
      if (!gasto || gasto.estado !== 'PENDIENTE') throw errors.conflict('El gasto no existe o no está pendiente.')
      const metodo = input.metodo ?? 'EFECTIVO'
      const totalCent = num(gasto, 'totalCent')
      return db.transaction(() => {
        const contrapartida = registrarContrapartida(ctx, {
          metodo,
          cajaSesionId: input.cajaSesionId,
          bancoCuentaId: input.bancoCuentaId,
          montoCent: totalCent,
          docTipo: 'GASTO',
          docId: id,
          descripcion: `Pago de gasto ${gasto.numero}: ${gasto.concepto}`,
          referencia: input.referencia ?? '',
          direccion: 'EGRESO'
        })
        fin.pagarGasto(db, {
          empresaId: ctx.empresaId,
          id,
          metodo,
          cajaSesionId: contrapartida.cajaSesionId,
          cajaMovimientoId: contrapartida.cajaMovimientoId,
          bancoCuentaId: contrapartida.bancoCuentaId,
          bancoMovimientoId: contrapartida.bancoMovimientoId,
          referencia: input.referencia ?? ''
        })
        audit(ctx, 'MODIFICAR', 'gastos', id, { estado: gasto.estado }, {
          estado: 'CONTABILIZADO', totalCent, metodo
        })
        return { id, estado: 'CONTABILIZADO' }
      })()
    },

    gastosAnular(ctx: SessionContext, input: AnularFinanzasInput) {
      exigir(ctx, 'gastos.anular')
      const id = Number(input.id)
      const gasto = fin.getGasto(db, ctx.empresaId, id)
      if (!gasto || gasto.estado === 'ANULADO') throw errors.conflict('El gasto ya está anulado o no existe.')
      return db.transaction(() => {
        if (gasto.estado === 'CONTABILIZADO') {
          reversarContrapartida(ctx, {
            cajaSesionId: gasto.cajaSesionId ? num(gasto, 'cajaSesionId') : null,
            cajaMovimientoId: gasto.cajaMovimientoId ? num(gasto, 'cajaMovimientoId') : null,
            bancoCuentaId: gasto.bancoCuentaId ? num(gasto, 'bancoCuentaId') : null,
            bancoMovimientoId: gasto.bancoMovimientoId ? num(gasto, 'bancoMovimientoId') : null
          }, 'EGRESO', num(gasto, 'totalCent'), 'ANULACION_GASTO', id,
          `Reversa por anulación del gasto ${gasto.numero}`)
        }
        fin.anularGasto(db, ctx.empresaId, id)
        audit(ctx, 'ANULAR', 'gastos', id, { estado: gasto.estado }, {
          estado: 'ANULADO', motivo: input.motivo
        })
        return { id, estado: 'ANULADO' }
      })()
    },

    gastosRecurrentes(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'gastos.consultar')
      return fin.listarRecurrentes(db, ctx.empresaId, norm(filtro))
    },

    gastosRecurrenteCrear(ctx: SessionContext, input: GastoRecurrenteInput) {
      exigir(ctx, 'gastos.crear')
      const categoriaId = Number(input.categoriaId)
      if (!fin.getCategoriaGasto(db, ctx.empresaId, categoriaId)) throw errors.notFound('Categoría de gasto')
      if (input.proveedorId && !fin.getProveedorFin(db, ctx.empresaId, Number(input.proveedorId))) {
        throw errors.notFound('Proveedor')
      }
      const id = fin.insertarRecurrente(db, {
        empresaId: ctx.empresaId,
        categoriaId,
        proveedorId: input.proveedorId ? Number(input.proveedorId) : null,
        concepto: String(input.concepto),
        montoCent: Number(input.montoCent),
        impuestoCent: Number(input.impuestoCent ?? 0),
        frecuencia: input.frecuencia ?? 'MENSUAL',
        proximaFecha: String(input.proximaFecha),
        activa: input.activa ?? true,
        usuarioId: ctx.userId
      })
      audit(ctx, 'CREAR', 'gastos_recurrentes', id, null, {
        categoriaId, concepto: input.concepto, frecuencia: input.frecuencia ?? 'MENSUAL'
      })
      return { id }
    },

    gastosRecurrenteGenerar(ctx: SessionContext, id: number) {
      exigir(ctx, 'gastos.crear')
      const recurrente = fin.getRecurrente(db, ctx.empresaId, id)
      if (!recurrente || Number(recurrente.activa) !== 1) throw errors.notFound('Gasto recurrente')
      const frecuencia = String(recurrente.frecuencia)
      const fecha = String(recurrente.proximaFecha)
      const montoCent = num(recurrente, 'montoCent')
      const impuestoCent = num(recurrente, 'impuestoCent')
      return db.transaction(() => {
        const numero = nextSerieNumber(db, ctx.empresaId, 'GASTO')
        const gastoId = fin.insertarGasto(db, {
          empresaId: ctx.empresaId,
          numero,
          categoriaId: num(recurrente, 'categoriaId'),
          proveedorId: recurrente.proveedorId ? num(recurrente, 'proveedorId') : null,
          fecha,
          concepto: String(recurrente.concepto),
          montoCent,
          impuestoCent,
          totalCent: montoCent + impuestoCent,
          metodo: 'EFECTIVO',
          recurrenteId: id,
          cajaSesionId: null,
          cajaMovimientoId: null,
          bancoCuentaId: null,
          bancoMovimientoId: null,
          estado: 'PENDIENTE',
          docReferencia: `Generado desde recurrente ${id}`,
          usuarioId: ctx.userId
        })
        fin.avanzarRecurrente(db, ctx.empresaId, id, sumarFecha(fecha, frecuencia))
        audit(ctx, 'CREAR', 'gastos', gastoId, null, {
          numero, recurrenteId: id, totalCent: montoCent + impuestoCent
        })
        return { id: gastoId, numero }
      })()
    },

    comisionesList(ctx: SessionContext, filtro?: FinanzasFiltroInput) {
      exigir(ctx, 'gastos.consultar')
      return fin.listarComisiones(db, ctx.empresaId, norm(filtro))
    },

    comisionCrear(ctx: SessionContext, input: ComisionCrearInput) {
      exigir(ctx, 'gastos.crear')
      const vendedorId = Number(input.vendedorId)
      const docVentaId = Number(input.docVentaId)
      if (!fin.getVendedorFin(db, ctx.empresaId, vendedorId)) throw errors.notFound('Vendedor')
      if (!fin.getDocumentoVentaComision(db, ctx.empresaId, docVentaId)) {
        throw errors.notFound('Documento de venta')
      }
      const baseCent = Number(input.baseCent)
      const pctBp = Number(input.pctBp)
      const montoCent = redondear(baseCent * pctBp / 10000)
      return db.transaction(() => {
        const id = fin.insertarComision(db, {
          empresaId: ctx.empresaId,
          vendedorId,
          docVentaId,
          baseCent,
          pctBp,
          montoCent,
          fecha: input.fecha ?? hoy(),
          usuarioId: ctx.userId
        })
        audit(ctx, 'CREAR', 'comisiones', id, null, {
          vendedorId, docVentaId, baseCent, pctBp, montoCent
        })
        return { id, montoCent }
      })()
    },

    comisionPagar(ctx: SessionContext, input: ComisionPagarInput) {
      exigir(ctx, 'gastos.aprobar')
      const id = Number(input.id)
      const comision = fin.getComision(db, ctx.empresaId, id)
      if (!comision || comision.estado !== 'PENDIENTE') {
        throw errors.conflict('La comisión no existe o ya fue pagada.')
      }
      const metodo = input.metodo ?? 'EFECTIVO'
      const montoCent = num(comision, 'montoCent')
      return db.transaction(() => {
        const contrapartida = registrarContrapartida(ctx, {
          metodo,
          cajaSesionId: input.cajaSesionId,
          bancoCuentaId: input.bancoCuentaId,
          montoCent,
          docTipo: 'COMISION',
          docId: id,
          descripcion: `Pago de comisión a ${comision.vendedorId}`,
          referencia: input.referencia ?? '',
          direccion: 'EGRESO'
        })
        fin.pagarComision(db, {
          empresaId: ctx.empresaId,
          id,
          fechaPago: hoy(),
          pagoReferencia: input.referencia ?? '',
          metodo,
          cajaMovimientoId: contrapartida.cajaMovimientoId,
          bancoMovimientoId: contrapartida.bancoMovimientoId
        })
        audit(ctx, 'MODIFICAR', 'comisiones', id, { estado: comision.estado }, {
          estado: 'PAGADA', montoCent, metodo
        })
        return { id, estado: 'PAGADA' }
      })()
    },

    // --------------------------- Impresión/exportación -----------------------

    cxcImprimir(ctx: SessionContext, input: ImprimirFinanzasInput) {
      return datosImpresion(ctx, input, 'cxc')
    },

    cxpImprimir(ctx: SessionContext, input: ImprimirFinanzasInput) {
      return datosImpresion(ctx, input, 'cxp')
    },

    bancosImprimir(ctx: SessionContext, input: ImprimirFinanzasInput) {
      return datosImpresion(ctx, input, 'bancos')
    },

    cajasImprimir(ctx: SessionContext, input: ImprimirFinanzasInput) {
      return datosImpresion(ctx, input, 'cajas')
    },

    cxcExportar(ctx: SessionContext, input: ExportarFinanzasInput) {
      return exportar(ctx, input, 'cxc')
    },

    cxpExportar(ctx: SessionContext, input: ExportarFinanzasInput) {
      return exportar(ctx, input, 'cxp')
    }
  }
}
