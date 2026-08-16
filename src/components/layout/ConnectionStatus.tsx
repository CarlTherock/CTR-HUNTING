import { Wifi, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { Badge } from '@/components/ui'

export function ConnectionStatus() {
  const isOnline = useOnlineStatus()

  return (
    <Badge
      variant={isOnline ? 'success' : 'warning'}
      className="gap-1.5"
      aria-live="polite"
    >
      {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
      {isOnline ? 'Online' : 'Offline'}
    </Badge>
  )
}
