import { Pentagon, Ruler } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { startMeasure } from '../startMeasure'
import { useMeasureStore } from '../state/measureStore'

/** The two entries of the "Outils" sheet. Results live in `MeasurePanel`. */
export function MeasureTools() {
  const kind = useMeasureStore((state) => state.kind)
  const active = useMeasureStore((state) => state.active)

  return (
    <>
      <ToolTrigger
        label="Mesurer une distance"
        icon={<Ruler size={18} aria-hidden="true" />}
        onClick={() => startMeasure('distance')}
        active={kind === 'distance'}
        pressed={kind === 'distance' && active}
        order={32}
      />
      <ToolTrigger
        label="Mesurer une surface"
        icon={<Pentagon size={18} aria-hidden="true" />}
        onClick={() => startMeasure('area')}
        active={kind === 'area'}
        pressed={kind === 'area' && active}
        order={33}
      />
    </>
  )
}
