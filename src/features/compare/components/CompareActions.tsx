import { useNavigate } from 'react-router-dom'
import { ClipboardList, FileText, MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui'
import { openWaypointSheet, startGuidanceTo, viewWaypointOnMap } from '../compareActions'
import type { WaypointComparison } from '../types'

interface CompareActionsProps {
  row: WaypointComparison
  onShowObservations: (waypointId: string) => void
  observationsOpen: boolean
}

/** Les quatre actions d'un point comparé. Aucune ne modifie le point. */
export function CompareActions({
  row,
  onShowObservations,
  observationsOpen,
}: CompareActionsProps) {
  const navigate = useNavigate()
  return (
    <div
      className="flex flex-col gap-2"
      role="group"
      aria-label={`Actions : ${row.name}`}
    >
      <Button
        variant="secondary"
        size="md"
        className="h-11 w-full justify-start"
        onClick={() => viewWaypointOnMap(row.waypointId, navigate)}
      >
        <MapPin size={16} aria-hidden="true" />
        Voir sur la carte
      </Button>
      <Button
        variant="primary"
        size="md"
        className="h-11 w-full justify-start"
        onClick={() => startGuidanceTo(row.waypointId, navigate)}
      >
        <Navigation size={16} aria-hidden="true" />
        Aller à
      </Button>
      <Button
        variant="secondary"
        size="md"
        className="h-11 w-full justify-start"
        onClick={() => openWaypointSheet(row.waypointId)}
      >
        <FileText size={16} aria-hidden="true" />
        Ouvrir la fiche
      </Button>
      <Button
        variant="ghost"
        size="md"
        className="h-11 w-full justify-start text-left"
        aria-pressed={observationsOpen}
        onClick={() => onShowObservations(row.waypointId)}
      >
        <ClipboardList size={16} aria-hidden="true" />
        Consulter les observations associées
      </Button>
    </div>
  )
}
