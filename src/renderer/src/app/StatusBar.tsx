import { useEffect, useState } from 'react'
import { HardDrive, WifiOff } from 'lucide-react'
import type { AppInfo } from '@shared/app-info'

export function StatusBar(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api.app
      .getInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-white px-4 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-900">
      <span className="flex items-center gap-1">
        <WifiOff size={12} /> Modo local · sin Internet
      </span>
      {info && (
        <span className="flex min-w-0 items-center gap-1">
          <HardDrive size={12} />
          <span className="truncate">{info.userDataPath}</span>
        </span>
      )}
      <span className="ml-auto">{info ? `v${info.version}` : ''}</span>
    </footer>
  )
}
