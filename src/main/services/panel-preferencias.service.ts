import type { Db } from '../db/connection'
import { createAjustesService } from './ajustes.service'
import { requirePermission, type SessionContext } from './context'
import type { PreferenciasPanel } from '@shared/schemas/paneles'
import type { Settings } from '@shared/settings'

const clamp = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

/**
 * Preferencias efectivas de los paneles: combinan la estación (Settings), los
 * ajustes de empresa y los permisos del usuario. Todo se calcula en el proceso
 * principal; el renderer solo consume el resultado.
 */
export function createPanelPreferenciasService(
  db: Db,
  ajustes: ReturnType<typeof createAjustesService>,
  cargar: () => Settings
) {
  void db

  function get(ctx: SessionContext): PreferenciasPanel {
    requirePermission(ctx, 'dashboard.consultar')
    const panel = cargar().panel
    const widgets = ajustes.leerGrupo(ctx.empresaId, 'widgets')
    const rendimiento = ajustes.leerGrupo(ctx.empresaId, 'rendimiento')
    const filasDashboard = clamp(panel.filasDashboard, 3, 20)
    return {
      verUtilidad: panel.verUtilidad && ctx.permisos.includes('reportes.ganancia'),
      verCostos: panel.verCostos && ctx.permisos.includes('reportes.costo'),
      verSalud: panel.verSalud && ctx.permisos.includes('salud.consultar'),
      seriesPorDefecto: panel.seriesPorDefecto,
      filasDashboard,
      filasPanel: clamp(Math.min(filasDashboard, widgets.filas, rendimiento.limiteFilas), 3, 50),
      intervaloActualizacionSeg: clamp(widgets.intervaloActualizacionSeg, 30, 3600)
    }
  }

  return { get }
}
