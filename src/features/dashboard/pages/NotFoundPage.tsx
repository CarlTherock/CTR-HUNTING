import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState, Button } from '@/components/ui'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass size={28} aria-hidden="true" />}
      title="Page introuvable"
      description="Cet emplacement n’existe pas dans l’application."
      action={
        <Link to="/">
          <Button variant="secondary" size="sm">
            Retour au tableau de bord
          </Button>
        </Link>
      }
    />
  )
}
