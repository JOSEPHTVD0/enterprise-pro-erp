import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Search, CornerDownLeft, X, Users, Package, Truck, UserRound, Tags, Ruler, List
} from 'lucide-react'
import { moduleGroups, modulePermission, type ModuleDef } from '@/app/modules'
import { useAppStore } from '@/app/store'
import { useAjustesStore } from '@/app/ajustes-store'
import { can, useSessionStore } from '@/app/session'
import { coincideTexto, normalizarTexto } from '@shared/texto'
import type { BusquedaGlobalResultado } from '@shared/schemas/busqueda'

interface Resultado {
  id: string
  titulo: string
  subtitulo: string
  vista: string
  icono: ModuleDef['icon']
  tipo?: string
}

const iconosEntidad: Record<string, ModuleDef['icon']> = {
  clientes: Users,
  productos: Package,
  proveedores: Truck,
  vendedores: UserRound,
  categorias: Tags,
  marcas: Tags,
  unidades_medida: Ruler,
  listas_precio: List
}

/** Paleta global: el backend filtra entidades por permiso y por empresa antes de responder. */
export function CommandPalette(): React.JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const ctx = useSessionStore((s) => s.ctx)
  const moduloActivo = useAjustesStore((s) => s.moduloActivo)
  const listaId = useId()

  useEffect(() => {
    function alPulsar(evento: KeyboardEvent): void {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        setAbierto((valor) => !valor)
      } else if (evento.key === 'Escape') {
        setAbierto(false)
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  useEffect(() => {
    if (abierto) inputRef.current?.focus()
    else setConsulta('')
  }, [abierto])

  const modulos = useMemo(() => moduleGroups.flatMap((grupo) => grupo.modules)
    .filter((modulo) => {
      const permiso = modulePermission(modulo.id)
      return (permiso === undefined || can(permiso)) && moduloActivo(modulo.id)
    })
    .map((modulo) => ({
      id: `modulo:${modulo.id}`,
      titulo: modulo.label,
      subtitulo: modulo.description,
      vista: modulo.id,
      icono: modulo.icon
    })), [ctx, moduloActivo])

  useEffect(() => {
    const texto = normalizarTexto(consulta)
    const base = modulos.filter((item) => coincideTexto(`${item.titulo} ${item.subtitulo}`, consulta)).slice(0, 12)
    if (!abierto || texto.length < 2) { setResultados(base); return }

    let vigente = true
    setResultados(base)
    const temporizador = window.setTimeout(() => {
      void window.api.invoke<BusquedaGlobalResultado[]>('busqueda.global', {
        texto: consulta.trim(), limite: 8
      }).then((respuesta) => {
        if (!vigente) return
        const entidades = (respuesta ?? []).map((fila): Resultado => ({
          id: fila.id,
          titulo: fila.titulo,
          subtitulo: fila.subtitulo,
          vista: fila.vista,
          icono: iconosEntidad[fila.entidad] ?? Search,
          tipo: fila.entidad
        }))
        setResultados([...base, ...entidades].slice(0, 20))
      }).catch(() => undefined)
    }, 120)
    return () => { vigente = false; window.clearTimeout(temporizador) }
  }, [abierto, consulta, modulos])

  function abrir(resultado: Resultado): void {
    setActiveView(resultado.vista)
    setAbierto(false)
  }

  if (!abierto) return <></>

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/60 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(evento) => { if (evento.target === evento.currentTarget) setAbierto(false) }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && resultados[0]) abrir(resultados[0])
            }}
            placeholder="Buscar módulos, clientes, productos, proveedores…"
            aria-label="Buscar en todo el ERP"
            role="combobox"
            aria-expanded={resultados.length > 0}
            aria-controls={listaId}
            aria-autocomplete="list"
          />
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setAbierto(false)} aria-label="Cerrar búsqueda">
            <X size={16} />
          </button>
        </div>
        <div id={listaId} aria-label="Resultados" className="max-h-[55vh] overflow-y-auto p-2">
          {resultados.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Sin resultados con sus permisos.</p>
          )}
          {resultados.map((resultado) => {
            const Icono = resultado.icono
            return (
              <button
                key={resultado.id}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => abrir(resultado)}
              >
                <Icono size={17} className="shrink-0 text-indigo-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{resultado.titulo}</span>
                  <span className="block truncate text-xs text-slate-400">{resultado.subtitulo}</span>
                </span>
                {resultado.tipo && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800">
                    {resultado.tipo}
                  </span>
                )}
                <CornerDownLeft size={14} className="shrink-0 text-slate-300" />
              </button>
            )
          })}
        </div>
        <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-700">
          Ctrl+K para abrir · Enter para el primero · Esc para cerrar · búsqueda global por permisos
        </div>
      </div>
    </div>
  )
}
