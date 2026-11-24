import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { useCatalogos } from './useCatalogos'
import { ExistenciasTab } from './ExistenciasTab'
import { KardexTab } from './KardexTab'
import { AjustesTab } from './AjustesTab'
import { TransferenciasTab } from './TransferenciasTab'
import { SeriesLotesTab } from './SeriesLotesTab'
import type { KardexFiltroUI } from './types'

const TABS = [
  { id: 'existencias', label: 'Existencias' },
  { id: 'kardex', label: 'Kardex' },
  { id: 'ajustes', label: 'Ajustes y conteos' },
  { id: 'transferencias', label: 'Transferencias' },
  { id: 'series', label: 'Series y lotes' }
]

export function InventarioPage(): React.JSX.Element {
  const [tab, setTab] = useState('existencias')
  const [filtroKardex, setFiltroKardex] = useState<KardexFiltroUI | undefined>()
  const { almacenes, productos } = useCatalogos()

  function irAKardex(filtro: KardexFiltroUI): void {
    setFiltroKardex(filtro)
    setTab('kardex')
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inventario"
        subtitle="Existencias valoradas, kardex inmutable y movimientos auditables por almacén."
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <TabPanel>
        {tab === 'existencias' && (
          <ExistenciasTab almacenes={almacenes} productos={productos} onVerKardex={irAKardex} />
        )}
        {tab === 'kardex' && (
          <KardexTab almacenes={almacenes} productos={productos} filtroInicial={filtroKardex} />
        )}
        {tab === 'ajustes' && <AjustesTab almacenes={almacenes} productos={productos} />}
        {tab === 'transferencias' && <TransferenciasTab almacenes={almacenes} productos={productos} />}
        {tab === 'series' && <SeriesLotesTab almacenes={almacenes} productos={productos} />}
      </TabPanel>
    </div>
  )
}
