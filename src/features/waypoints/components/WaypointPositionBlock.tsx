import { useState } from 'react'
import { Copy, Lock } from 'lucide-react'
import { Button } from '@/components/ui'
import { copyText } from '@/services/clipboard'
import {
  formatLatitude,
  formatLongitude,
  formatSignedDecimal,
} from '@/utils/coordinateFormat'
import { ShareActions } from '@/features/share/components/ShareActions'
import { buildWaypointShare } from '@/features/share/shareContent'
import type { Waypoint } from '@/types'

type CopyState = 'idle' | 'copied' | 'failed'

const SELECTABLE = { userSelect: 'text' } as const

/**
 * Top of a SAVED waypoint's sheet: its name and its (locked) coordinates in
 * large type, a "copy coordinates" action and the explicit "share this
 * point" action. Display only — the stored coordinate is never rounded or
 * changed; 5 decimals are just how it is shown.
 */
export function WaypointPositionBlock({ waypoint }: { waypoint: Waypoint }) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const { lat, lng } = waypoint.coordinate

  async function handleCopy() {
    const ok = await copyText(formatSignedDecimal(lat, lng))
    setCopyState(ok ? 'copied' : 'failed')
  }

  return (
    <section
      aria-label="Position du waypoint"
      data-testid="waypoint-position"
      className="bg-surface-800 flex flex-col gap-3 rounded-md p-3"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-ink-500 flex items-center gap-1.5 text-xs font-medium">
          <Lock size={12} aria-hidden="true" />
          Position du waypoint
        </h3>
        <p
          data-testid="waypoint-name"
          className="text-ink-100 text-2xl leading-tight font-semibold break-words select-text"
          style={SELECTABLE}
        >
          {waypoint.name}
        </p>
      </div>

      <dl className="grid gap-2">
        <div>
          <dt className="text-ink-500 text-xs font-medium">Latitude</dt>
          <dd
            data-testid="waypoint-latitude"
            className="text-ink-100 text-2xl font-semibold tabular-nums select-text"
            style={SELECTABLE}
          >
            {formatLatitude(lat)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500 text-xs font-medium">Longitude</dt>
          <dd
            data-testid="waypoint-longitude"
            className="text-ink-100 text-2xl font-semibold tabular-nums select-text"
            style={SELECTABLE}
          >
            {formatLongitude(lng)}
          </dd>
        </div>
      </dl>

      <p className="text-ink-500 text-xs">
        Les décimales affichées ne mesurent pas la précision du GPS.
      </p>
      <p className="text-ink-300 text-xs">
        Position verrouillée. Pour la changer, supprimez ce point et créez-en un nouveau.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="md" onClick={() => void handleCopy()}>
            <Copy size={14} aria-hidden="true" />
            Copier les coordonnées
          </Button>
        </div>
        <div aria-live="polite">
          {copyState === 'copied' && (
            <p role="status" className="text-status-success text-sm">
              Coordonnées copiées
            </p>
          )}
        </div>
        {copyState === 'failed' && (
          <p role="alert" className="text-status-danger text-sm">
            Copie impossible — sélectionnez et copiez le texte manuellement.
          </p>
        )}
      </div>

      <ShareActions
        testId="waypoint"
        shareLabel="Partager ce point"
        payload={buildWaypointShare(waypoint, {
          origin: window.location.origin,
          baseUrl: import.meta.env.BASE_URL,
        })}
      />
    </section>
  )
}
