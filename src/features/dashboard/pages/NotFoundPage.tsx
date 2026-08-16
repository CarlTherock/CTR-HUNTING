import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState, Button } from '@/components/ui'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass size={28} aria-hidden="true" />}
      title="Page not found"
      description="That location doesn't exist in the app."
      action={
        <Link to="/">
          <Button variant="secondary" size="sm">
            Back to dashboard
          </Button>
        </Link>
      }
    />
  )
}
