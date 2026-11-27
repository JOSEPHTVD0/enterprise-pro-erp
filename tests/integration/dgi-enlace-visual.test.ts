import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createAuthService } from '../../src/main/services/auth.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { defaultAjustes } from '@shared/schemas/ajustes'
import type { SessionContext } from '@shared/session'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-DGI').context as SessionContext
  return { db, ctx, ajustes: createAjustesService(db) }
}

describe('enlace DGI configured solo para la interfaz', () => {
  it('persiste, audita y expone el rotulado sin introducir credenciales', () => {
    const { db, ctx, ajustes } = setup()
    const datos = {
      ...defaultAjustes.dgiEnlace,
      estadoVisual: 'EN_PREPARACION' as const,
      ambienteVisual: 'PRUEBAS' as const,
      notaInformativa: 'Solo visual, sin emisión real.'
    }

    ajustes.save(ctx, { grupo: 'dgiEnlace', datos })
    expect(ajustes.get(ctx, { grupo: 'dgiEnlace' }).dgiEnlace).toMatchObject(datos)
    expect((ajustes.efectivos(ctx) as Record<string, Record<string, unknown>>).dgiEnlace)
      .toMatchObject({ estadoVisual: 'EN_PREPARACION', ambienteVisual: 'PRUEBAS' })

    const guardado = db.prepare("SELECT datos_json FROM ajustes WHERE empresa_id = 1 AND grupo = 'dgiEnlace'").get() as { datos_json: string }
    expect(JSON.parse(guardado.datos_json)).toEqual(datos)
    expect(Object.keys(JSON.parse(guardado.datos_json)).every(
      (clave) => !/url|token|endpoint|cert|password/i.test(clave)
    )).toBe(true)

    const auditoria = db.prepare("SELECT COUNT(*) AS total FROM auditoria WHERE entidad = 'ajustes' AND entidad_id = 'dgiEnlace'").get() as { total: number }
    expect(auditoria.total).toBe(1)
    db.close()
  })

  it('conserva los ajustes anteriores al aplicar la migración del grupo', () => {
    const { db, ctx, ajustes } = setup()
    ajustes.save(ctx, { grupo: 'alertas', datos: { ...defaultAjustes.alertas, stockBajoUmbral: 33 } })
    expect(ajustes.get(ctx, { grupo: 'alertas' }).alertas?.stockBajoUmbral).toBe(33)
    expect(ajustes.get(ctx, { grupo: 'dgiEnlace' }).dgiEnlace?.estadoVisual).toBe('SIN_ENLACE')
    db.close()
  })
})
