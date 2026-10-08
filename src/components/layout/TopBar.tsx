import { useLocation } from 'react-router-dom'
import { APP_NAME } from '@/app/appInfo'
import { titleForPath } from '@/app/navigation'
import { ConnectionStatus } from './ConnectionStatus'

export function TopBar() {
  const location = useLocation()
  const title = titleForPath(location.pathname) ?? APP_NAME

  return (
    <header
      className="border-surface-800 bg-surface-900 flex min-h-12 shrink-0 items-center justify-between border-b px-4 md:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <p className="text-ink-100 text-sm font-semibold">{title}</p>
      <ConnectionStatus />
    </header>
  )
}
