import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataTable } from '@/components/ui/DataTable'
import { Field, NumberInput, TextInput } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonChart } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { TabPanel, Tabs } from '@/components/ui/Tabs'

describe('primitivos de interfaz', () => {
  it('Field asocia etiqueta, control y ayuda', () => {
    const html = renderToStaticMarkup(createElement(
      Field,
      {
        label: 'Monto',
        hint: 'El backend guarda centavos',
        children: createElement(TextInput, { placeholder: '0' })
      }
    ))
    const id = html.match(/<input[^>]*\sid="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`<label for="${id}"`)
    expect(html).toContain(`aria-describedby="${id}-hint"`)
    expect(html).toContain(`id="${id}-hint"`)
  })

  it('Field también asocia NumberInput personalizado', () => {
    const html = renderToStaticMarkup(createElement(
      Field,
      {
        label: 'Cantidad',
        children: createElement(NumberInput, { label: 'Cantidad', value: 2, onChange: () => undefined })
      }
    ))
    expect(html).toMatch(/<label for="[^"]+"/)
    expect(html).toContain('aria-label="Cantidad"')
  })

  it('StatCard muestra esqueleto mientras carga y oculta el valor', () => {
    const cargando = renderToStaticMarkup(createElement(
      StatCard, { label: 'Ventas', value: 'RD$ 1,00', loading: true }
    ))
    expect(cargando).toContain('erp-skeleton')
    expect(cargando).not.toContain('RD$ 1,00')

    const listo = renderToStaticMarkup(createElement(
      StatCard, { label: 'Ventas', value: 'RD$ 1,00' }
    ))
    expect(listo).not.toContain('erp-skeleton')
    expect(listo).toContain('RD$ 1,00')
  })

  it('EmptyState y SkeletonChart son anunciados de forma adecuada', () => {
    const vacio = renderToStaticMarkup(createElement(
      EmptyState, { title: 'Sin ventas', description: 'Ajuste los filtros' }
    ))
    expect(vacio).toContain('role="status"')
    expect(vacio).toContain('Sin ventas')

    expect(renderToStaticMarkup(createElement(SkeletonChart))).toContain('aria-hidden="true"')
  })

  it('DataTable muestra esqueletos accesibles mientras carga', () => {
    const columnas = [{ key: 'id', header: 'ID' }]
    const cargando = renderToStaticMarkup(createElement(DataTable, {
      columns: columnas,
      data: [{ id: 1 }],
      rowKey: (fila: unknown) => (fila as { id: number }).id,
      loading: true
    }))
    expect(cargando).toContain('aria-busy="true"')
    expect(cargando).toContain('erp-skeleton')
    expect(cargando).not.toContain('<table')

    const listo = renderToStaticMarkup(createElement(DataTable, {
      columns: columnas,
      data: [{ id: 1 }],
      rowKey: (fila: unknown) => (fila as { id: number }).id
    }))
    expect(listo).toContain('scope="col"')
    expect(listo).toContain('aria-sort="none"')
    expect(listo).toContain('aria-label="Ordenar por ID"')
  })

  it('Tabs expone estado seleccionado y navegación por teclado', () => {
    const html = renderToStaticMarkup(createElement(Tabs, {
      tabs: [{ id: 'uno', label: 'Uno' }, { id: 'dos', label: 'Dos' }],
      active: 'dos',
      onChange: () => undefined
    }))
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('tabindex="-1"')

    const panel = renderToStaticMarkup(createElement(TabPanel, null, 'Contenido'))
    expect(panel).toContain('role="region"')
    expect(panel).toContain('Contenido')
  })
})
