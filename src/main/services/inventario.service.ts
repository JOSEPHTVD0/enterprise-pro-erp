import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import * as repo from '../repositories/inventario.repo'
import { writeAudit } from '../repositories/auditoria.repo'
import { requirePermission, type SessionContext } from './context'
import { errors } from '@shared/errors'
import { calcularEntrada, calcularEntradaSinRecalculo, calcularSalida, costoVigente } from '../core/costos'
import { multiplicarCentavos, redondear, redondearCantidad } from '../core/dinero'
import type {
  MovimientoInput, AjusteInput, TransferenciaInput,
  KardexFiltroInput, ExistenciasFiltro
} from '@shared/schemas/inventario'

interface ResultadoMovimiento {
  id: number
  costoUnitCent: number
  costoTotalCent: number
  saldoCantidad: number
  saldoValorCent: number
}

interface AplicarMovimiento {
  tipo: string
  productoId: number
  almacenId: number
  /** Firmada: > 0 entrada, < 0 salida. */
  cantidad: number
  costoUnitCent: number
  docTipo: string
  docId?: number
  docLineaId?: number
  motivo?: string
  referencia?: string
  /** Las transferencias entran al costo que tenían en origen: no recalculan. */
  recalcular?: boolean
}

const TIPO_DOC_AJUSTE: Record<string, string> = {
  AJUSTE: 'AJUSTE', CONTEO: 'CONTEO', PERDIDA: 'PERDIDA', DANIO: 'DANIO'
}

/** Fase 5 — Inventario. Toda escritura ocurre dentro de una transacción del servicio. */
export function createInventarioService(db: Db) {
  function audit(
    ctx: SessionContext, operacion: string, entidad: string,
    id: number, antes: unknown, despues: unknown
  ): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  function permiteStockNegativo(ctx: SessionContext): boolean {
    const row = db.prepare(`
      SELECT valor FROM parametros WHERE empresa_id = ? AND clave = 'permitir_stock_negativo'
    `).get(ctx.empresaId) as { valor: string } | undefined
    return ['true', '1', 'si', 'sí'].includes(String(row?.valor ?? '').toLowerCase())
  }

  function validarProducto(ctx: SessionContext, productoId: number) {
    const producto = repo.obtenerProducto(db, ctx.empresaId, productoId)
    if (!producto) throw errors.notFound('Producto')
    return producto
  }

  function validarAlmacen(ctx: SessionContext, almacenId: number) {
    const almacen = repo.obtenerAlmacen(db, ctx.empresaId, almacenId)
    if (!almacen) throw errors.notFound('Almacén')
    return almacen
  }

  /**
   * Núcleo del kardex. Calcula saldos, actualiza la existencia, inserta un
   * movimiento inmutable y ajusta el costo promedio del producto.
   */
  function aplicarMovimiento(ctx: SessionContext, input: AplicarMovimiento): ResultadoMovimiento {
    const producto = validarProducto(ctx, input.productoId)
    validarAlmacen(ctx, input.almacenId)

    const saldo = repo.obtenerExistencia(db, ctx.empresaId, input.productoId, input.almacenId)
      ?? { cantidad: 0, valor_cent: 0 }
    const cantidad = redondearCantidad(input.cantidad)
    if (!cantidad) throw errors.validation('La cantidad del movimiento no puede ser cero.')

    const esEntrada = cantidad > 0
    if (!esEntrada && saldo.cantidad + cantidad < -1e-9 && !permiteStockNegativo(ctx)) {
      throw errors.conflict(
        `Stock insuficiente: hay ${redondearCantidad(saldo.cantidad)} unidad(es) disponible(s) y se requieren ${redondearCantidad(Math.abs(cantidad))}.`
      )
    }

    const costoEntrada = redondear(input.costoUnitCent)
    let nuevaCantidad: number
    let nuevoValor: number
    let nuevoPromedio: number
    let costoKardex: number
    let totalKardex: number
    let ultimaCompra: number | undefined

    if (esEntrada) {
      const recalcular = input.recalcular ?? input.tipo !== 'TRANSFERENCIA_ENTRADA'
      const resultado = recalcular
        ? calcularEntrada({
          existenciaCantidad: saldo.cantidad,
          existenciaValorCent: saldo.valor_cent,
          entradaCantidad: cantidad,
          entradaCostoUnitCent: costoEntrada
        })
        : calcularEntradaSinRecalculo(
          saldo.cantidad, saldo.valor_cent, cantidad, costoEntrada
        )
      nuevaCantidad = resultado.cantidad
      nuevoValor = resultado.valorCent
      nuevoPromedio = resultado.costoUnitCent
      costoKardex = costoEntrada
      totalKardex = multiplicarCentavos(costoEntrada, cantidad)
      if (['COMPRA', 'DEV_VENTA'].includes(input.tipo)) ultimaCompra = costoEntrada
    } else {
      const vigente = costoVigente(producto.costo_promedio_cent, saldo.cantidad, saldo.valor_cent)
      const resultado = calcularSalida(vigente, cantidad, saldo.cantidad, saldo.valor_cent)
      nuevaCantidad = resultado.saldoCantidad
      nuevoValor = resultado.saldoValorCent
      nuevoPromedio = redondear(producto.costo_promedio_cent)
      costoKardex = resultado.costoUnitCent
      totalKardex = -resultado.costoTotalCent
    }

    repo.guardarExistencia(db, ctx.empresaId, input.productoId, input.almacenId, nuevaCantidad, nuevoValor)
    const movimientoId = repo.insertarMovimiento(db, {
      empresaId: ctx.empresaId,
      tipo: input.tipo,
      productoId: input.productoId,
      almacenId: input.almacenId,
      cantidad,
      costoUnitCent: costoKardex,
      costoTotalCent: totalKardex,
      saldoCantidad: nuevaCantidad,
      saldoCostoCent: nuevoValor,
      docTipo: input.docTipo,
      docId: input.docId ?? null,
      docLineaId: input.docLineaId ?? null,
      motivo: input.motivo ?? '',
      referencia: input.referencia ?? '',
      usuarioId: ctx.userId
    })

    repo.actualizarCostoProducto(db, ctx.empresaId, input.productoId, nuevoPromedio, ultimaCompra)
    if (nuevoPromedio !== redondear(producto.costo_promedio_cent)) {
      repo.registrarCosto(
        db, ctx.empresaId, input.productoId,
        redondear(producto.costo_promedio_cent), nuevoPromedio,
        input.docTipo, input.docId ?? null
      )
    }

    return {
      id: movimientoId,
      costoUnitCent: costoKardex,
      costoTotalCent: totalKardex,
      saldoCantidad: nuevaCantidad,
      saldoValorCent: nuevoValor
    }
  }

  async function workbook(filas: Record<string, unknown>[], columnas: { header: string; key: string }[]): Promise<string> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Inventario')
    ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 3) }))
    ws.getRow(1).font = { bold: true }
    for (const fila of filas) ws.addRow(fila)
    const buffer = await wb.xlsx.writeBuffer()
    return Buffer.from(buffer).toString('base64')
  }

  return {
    /** Catálogos mínimos para los formularios; el backend decide qué se muestra. */
    catalogos(ctx: SessionContext) {
      requirePermission(ctx, 'inventario.consultar')
      return {
        almacenes: repo.listarAlmacenes(db, ctx.empresaId),
        productos: repo.listarProductos(db, ctx.empresaId)
      }
    },

    existencias(ctx: SessionContext, filtro: ExistenciasFiltro) {
      requirePermission(ctx, 'inventario.consultar')
      const filas = repo.listarExistencias(db, ctx.empresaId, filtro)
      if (!ctx.permisos.includes('inventario.costo')) {
        for (const fila of filas) delete fila.valorCent
      }
      return filas
    },

    kardex(ctx: SessionContext, filtro: KardexFiltroInput) {
      requirePermission(ctx, 'inventario.consultar')
      const filas = repo.listarKardex(db, ctx.empresaId, filtro)
      if (!ctx.permisos.includes('inventario.costo')) {
        for (const fila of filas) {
          delete fila.costoUnitCent
          delete fila.costoTotalCent
          delete fila.saldoCostoCent
        }
      }
      return filas
    },

    costos(ctx: SessionContext, productoId: number) {
      requirePermission(ctx, 'inventario.consultar')
      requirePermission(ctx, 'inventario.costo')
      validarProducto(ctx, productoId)
      return {
        historial: repo.historialCostos(db, ctx.empresaId, productoId),
        movimientos: repo.listarKardex(db, ctx.empresaId, { productoId, limite: 100 })
      }
    },

    movimiento(ctx: SessionContext, input: MovimientoInput) {
      requirePermission(ctx, 'inventario.crear')
      const movimientoId = db.transaction(() => {
        const resultado = aplicarMovimiento(ctx, {
          tipo: input.tipo,
          productoId: input.productoId,
          almacenId: input.almacenId,
          cantidad: input.cantidad,
          costoUnitCent: input.costoUnitCent,
          docTipo: 'MOVIMIENTO',
          motivo: input.motivo,
          referencia: input.referencia
        })
        audit(ctx, 'CREAR', 'movimientos_inventario', resultado.id, null, {
          tipo: input.tipo, cantidad: input.cantidad, productoId: input.productoId,
          almacenId: input.almacenId, saldoCantidad: resultado.saldoCantidad
        })
        return resultado.id
      })()
      return { id: movimientoId }
    },

    /**
     * Uso INTERNO de otros servicios (Fase 6+). Intencionalmente NO se registra
     * como canal IPC: la transacción y la auditoría las hace el servicio que llama.
     * Acepta doc_tipo/doc_id/doc_linea_id para conservar la trazabilidad del kardex.
     */
    movimientoDocumento(ctx: SessionContext, input: AplicarMovimiento): ResultadoMovimiento {
      return aplicarMovimiento(ctx, input)
    },

    transferencia(ctx: SessionContext, input: TransferenciaInput) {
      requirePermission(ctx, 'inventario.crear')
      validarAlmacen(ctx, input.almacenOrigenId)
      validarAlmacen(ctx, input.almacenDestinoId)
      for (const linea of input.lineas) validarProducto(ctx, linea.productoId)

      const transferenciaId = db.transaction(() => {
        const numero = repo.siguienteNumero(db, ctx.empresaId, 'TRANSFERENCIA_INVENTARIO')
        const id = repo.guardarTransferencia(db, {
          empresaId: ctx.empresaId,
          numero,
          motivo: input.motivo,
          usuarioId: ctx.userId,
          almacenOrigenId: input.almacenOrigenId,
          almacenDestinoId: input.almacenDestinoId
        })
        for (const linea of input.lineas) {
          const salida = aplicarMovimiento(ctx, {
            tipo: 'TRANSFERENCIA_SALIDA',
            productoId: linea.productoId,
            almacenId: input.almacenOrigenId,
            cantidad: -linea.cantidad,
            costoUnitCent: 0,
            docTipo: 'TRANSFERENCIA',
            docId: id,
            motivo: input.motivo || `Transferencia ${numero}`
          })
          const entrada = aplicarMovimiento(ctx, {
            tipo: 'TRANSFERENCIA_ENTRADA',
            productoId: linea.productoId,
            almacenId: input.almacenDestinoId,
            cantidad: linea.cantidad,
            costoUnitCent: salida.costoUnitCent,
            docTipo: 'TRANSFERENCIA',
            docId: id,
            motivo: input.motivo || `Transferencia ${numero}`,
            recalcular: false
          })
          const lineaId = repo.guardarLineaTransferencia(
            db, id, linea.productoId, linea.cantidad, salida.costoUnitCent
          )
          repo.vincularMovimientosTransferencia(db, lineaId, salida.id, entrada.id)
        }
        audit(ctx, 'CREAR', 'transferencias', id, null, {
          numero, ...input, estado: 'ACTIVO'
        })
        return id
      })()
      return { id: transferenciaId }
    },

    ajuste(ctx: SessionContext, input: AjusteInput) {
      requirePermission(ctx, 'inventario.crear')
      validarAlmacen(ctx, input.almacenId)
      for (const linea of input.lineas) validarProducto(ctx, linea.productoId)

      const ajusteId = db.transaction(() => {
        const numero = repo.siguienteNumero(db, ctx.empresaId, 'AJUSTE_INVENTARIO')
        const id = repo.guardarAjuste(db, {
          empresaId: ctx.empresaId,
          numero,
          tipo: input.tipo,
          almacenId: input.almacenId,
          motivo: input.motivo,
          usuarioId: ctx.userId
        })
        let aplicadas = 0
        for (const linea of input.lineas) {
          let delta: number
          let cantidadNueva: number | null = null
          if (input.tipo === 'CONTEO') {
            const saldo = repo.obtenerExistencia(db, ctx.empresaId, linea.productoId, input.almacenId)
              ?? { cantidad: 0, valor_cent: 0 }
            cantidadNueva = redondearCantidad(linea.cantidadNueva ?? 0)
            delta = redondearCantidad(cantidadNueva - saldo.cantidad)
            if (!delta) continue
          } else {
            delta = redondearCantidad(linea.cantidad ?? 0)
          }
          if (!delta) throw errors.validation('Una línea produjo una cantidad cero; revise el ajuste.')

          const tipoMovimiento = input.tipo === 'CONTEO'
            ? 'CONTEO'
            : (input.tipo === 'PERDIDA' || input.tipo === 'DANIO')
              ? input.tipo
              : delta > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA'
          const producto = validarProducto(ctx, linea.productoId)
          const costo = delta > 0
            ? (linea.costoUnitCent ?? redondear(producto.costo_promedio_cent))
            : 0
          const movimiento = aplicarMovimiento(ctx, {
            tipo: tipoMovimiento,
            productoId: linea.productoId,
            almacenId: input.almacenId,
            cantidad: delta,
            costoUnitCent: costo,
            docTipo: TIPO_DOC_AJUSTE[input.tipo],
            docId: id,
            motivo: input.motivo,
            referencia: cantidadNueva === null ? '' : `Conteo: ${cantidadNueva}`
          })
          repo.guardarLineaAjuste(db, {
            ajusteId: id,
            productoId: linea.productoId,
            cantidad: delta,
            cantidadNueva,
            costoUnitCent: costo,
            movimientoId: movimiento.id
          })
          aplicadas++
        }
        if (!aplicadas) throw errors.validation('El ajuste no produjo ningún movimiento. Revise las cantidades.')
        audit(ctx, 'CREAR', 'ajustes_inventario', id, null, {
          numero, tipo: input.tipo, almacenId: input.almacenId, motivo: input.motivo,
          lineas: input.lineas.length
        })
        return id
      })()
      return { id: ajusteId }
    },

    /** Las anulaciones se hacen con movimientos inversos: el kardex nunca se edita. */
    anularTransferencia(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'inventario.modificar')
      const transferencia = repo.obtenerTransferencia(db, ctx.empresaId, id)
      if (!transferencia) throw errors.notFound('Transferencia')
      if (transferencia.estado === 'ANULADO') throw errors.conflict('La transferencia ya está anulada.')

      db.transaction(() => {
        for (const linea of repo.lineasTransferencia(db, id)) {
          const cantidad = redondearCantidad(Number(linea.cantidad))
          const salida = aplicarMovimiento(ctx, {
            tipo: 'TRANSFERENCIA_SALIDA',
            productoId: Number(linea.productoId),
            almacenId: Number(transferencia.almacenDestinoId),
            cantidad: -cantidad,
            costoUnitCent: Number(linea.costoUnitCent),
            docTipo: 'REVERSA_TRANSFERENCIA',
            docId: id,
            motivo: `Reversa de ${String(transferencia.numero)}`
          })
          aplicarMovimiento(ctx, {
            tipo: 'TRANSFERENCIA_ENTRADA',
            productoId: Number(linea.productoId),
            almacenId: Number(transferencia.almacenOrigenId),
            cantidad,
            costoUnitCent: salida.costoUnitCent,
            docTipo: 'REVERSA_TRANSFERENCIA',
            docId: id,
            motivo: `Reversa de ${String(transferencia.numero)}`,
            recalcular: false
          })
        }
        repo.marcarTransferencia(db, ctx.empresaId, id, 'ANULADO')
        audit(ctx, 'ANULAR', 'transferencias', id, transferencia, { estado: 'ANULADO' })
      })()
      return { ok: true }
    },

    anularAjuste(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'inventario.modificar')
      const ajuste = repo.obtenerAjuste(db, ctx.empresaId, id)
      if (!ajuste) throw errors.notFound('Ajuste')
      if (ajuste.estado === 'ANULADO') throw errors.conflict('El ajuste ya está anulado.')

      db.transaction(() => {
        for (const linea of repo.lineasAjuste(db, id)) {
          const movimiento = repo.obtenerMovimiento(db, ctx.empresaId, Number(linea.movimientoId))
          if (!movimiento) continue
          const inversa = redondearCantidad(-Number(movimiento.cantidad))
          aplicarMovimiento(ctx, {
            tipo: inversa > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
            productoId: Number(linea.productoId),
            almacenId: Number(ajuste.almacenId),
            cantidad: inversa,
            costoUnitCent: inversa > 0 ? Number(movimiento.costoUnitCent) : 0,
            docTipo: 'REVERSA_AJUSTE',
            docId: id,
            motivo: `Reversa de ${String(ajuste.numero)}`
          })
        }
        repo.marcarAjuste(db, ctx.empresaId, id, 'ANULADO')
        audit(ctx, 'ANULAR', 'ajustes_inventario', id, ajuste, { estado: 'ANULADO' })
      })()
      return { ok: true }
    },

    transferencias(ctx: SessionContext) {
      requirePermission(ctx, 'inventario.consultar')
      return repo.listarTransferencias(db, ctx.empresaId)
    },

    ajustes(ctx: SessionContext) {
      requirePermission(ctx, 'inventario.consultar')
      return repo.listarAjustes(db, ctx.empresaId)
    },

    detalleTransferencia(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'inventario.consultar')
      const cabecera = repo.obtenerTransferencia(db, ctx.empresaId, id)
      if (!cabecera) throw errors.notFound('Transferencia')
      return { cabecera, lineas: repo.lineasTransferencia(db, id) }
    },

    detalleAjuste(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'inventario.consultar')
      const cabecera = repo.obtenerAjuste(db, ctx.empresaId, id)
      if (!cabecera) throw errors.notFound('Ajuste')
      return { cabecera, lineas: repo.lineasAjuste(db, id) }
    },

    series(ctx: SessionContext, productoId?: number) {
      requirePermission(ctx, 'inventario.consultar')
      return repo.listarSeries(db, ctx.empresaId, productoId)
    },

    crearSerie(ctx: SessionContext, input: { productoId: number; almacenId?: number; serie: string }) {
      requirePermission(ctx, 'inventario.crear')
      const producto = validarProducto(ctx, input.productoId)
      if (!producto.maneja_serie) throw errors.validation('El producto no está configurado para manejar series.')
      if (input.almacenId) validarAlmacen(ctx, input.almacenId)
      const id = db.transaction(() => {
        const serieId = repo.crearSerie(db, {
          empresaId: ctx.empresaId,
          productoId: input.productoId,
          almacenId: input.almacenId ?? null,
          serie: input.serie
        })
        audit(ctx, 'CREAR', 'series_producto', serieId, null, input)
        return serieId
      })()
      return { id }
    },

    lotes(ctx: SessionContext, productoId?: number) {
      requirePermission(ctx, 'inventario.consultar')
      return repo.listarLotes(db, ctx.empresaId, productoId)
    },

    crearLote(ctx: SessionContext, input: {
      productoId: number; almacenId?: number; lote: string; vencimiento?: string; cantidad?: number
    }) {
      requirePermission(ctx, 'inventario.crear')
      const producto = validarProducto(ctx, input.productoId)
      if (!producto.maneja_lote) throw errors.validation('El producto no está configurado para manejar lotes.')
      if (input.almacenId) validarAlmacen(ctx, input.almacenId)
      const id = db.transaction(() => {
        const loteId = repo.crearLote(db, {
          empresaId: ctx.empresaId,
          productoId: input.productoId,
          almacenId: input.almacenId ?? null,
          lote: input.lote,
          vencimiento: input.vencimiento ?? '',
          cantidad: redondearCantidad(input.cantidad ?? 0)
        })
        audit(ctx, 'CREAR', 'lotes_producto', loteId, null, input)
        return loteId
      })()
      return { id }
    },

    async exportar(ctx: SessionContext, vista: 'existencias' | 'kardex', filtro?: ExistenciasFiltro | KardexFiltroInput) {
      requirePermission(ctx, 'inventario.consultar')
      requirePermission(ctx, 'inventario.exportar')
      const fecha = new Date().toISOString().slice(0, 10)
      if (vista === 'existencias') {
        const filas = repo.listarExistencias(db, ctx.empresaId, (filtro ?? {}) as ExistenciasFiltro)
        if (!ctx.permisos.includes('inventario.costo')) {
          for (const fila of filas) delete fila.valorCent
        }
        return {
          filename: `existencias_${fecha}.xlsx`,
          base64: await workbook(filas, [
            { header: 'Código', key: 'codigo' }, { header: 'Producto', key: 'descripcion' },
            { header: 'Almacén', key: 'almacenNombre' }, { header: 'Cantidad', key: 'cantidad' },
            { header: 'Mínimo', key: 'existenciaMin' }, { header: 'Valor (centavos)', key: 'valorCent' }
          ])
        }
      }
      const filas = repo.listarKardex(db, ctx.empresaId, (filtro ?? { limite: 1000 }) as KardexFiltroInput)
      const columnas = [
        { header: 'Fecha', key: 'fecha' }, { header: 'Tipo', key: 'tipo' },
        { header: 'Código', key: 'codigo' }, { header: 'Producto', key: 'descripcion' },
        { header: 'Almacén', key: 'almacenNombre' }, { header: 'Cantidad', key: 'cantidad' }
      ]
      if (ctx.permisos.includes('inventario.costo')) {
        columnas.push(
          { header: 'Costo unit. (centavos)', key: 'costoUnitCent' },
          { header: 'Costo total (centavos)', key: 'costoTotalCent' },
          { header: 'Saldo valorado (centavos)', key: 'saldoCostoCent' }
        )
      }
      columnas.push(
        { header: 'Saldo cantidad', key: 'saldoCantidad' },
        { header: 'Documento', key: 'docTipo' }, { header: 'Motivo', key: 'motivo' }
      )
      return { filename: `kardex_${fecha}.xlsx`, base64: await workbook(filas, columnas) }
    }
  }
}
