import { CheckCircle2, Clock } from 'lucide-react'
import type { ModuleDef } from '@/app/modules'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'

/**
 * Vista honesta de módulo pendiente: describe el alcance real de su fase.
 * No contiene botones decorativos ni datos simulados.
 */
export function ModulePlaceholder({ module }: { module: ModuleDef }): React.JSX.Element {
  const Icon = module.icon
  return (
    <div className="animate-fade-in">
      <PageHeader
        title={module.label}
        subtitle={module.description}
        actions={<Badge tone="warning"><Clock size={12} /> Fase {module.phase}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Alcance planificado" subtitle="Funciones que se implementarán en esta fase">
          <ul className="space-y-2.5">
            {module.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Estado">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2.5 dark:bg-amber-900/40">
              <Icon size={22} className="text-amber-600 dark:text-amber-300" />
            </div>
            <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <p>
                Este módulo se activará en la <strong>Fase {module.phase}</strong> del plan de
                desarrollo aprobado.
              </p>
              <p className="mt-2">
                Cuando esté disponible trabajará contra la base de datos SQLite real, con
                permisos verificados en el backend, transacciones y auditoría. No se muestran
                datos de demostración.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
