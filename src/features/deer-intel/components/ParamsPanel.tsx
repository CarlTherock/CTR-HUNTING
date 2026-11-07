import { useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { cn } from '@/utils/cn'
import { useHuntStore } from '../state/huntStore'
import { COMPASS_8, minutesToTime, timeToMinutes } from './format'

const field =
  'bg-surface-800 border-surface-600 text-ink-100 min-h-11 w-full rounded-md border px-3 text-sm'

function DirectionPicker({
  label,
  help,
  value,
  onChange,
}: {
  label: string
  help: string
  value: number[]
  onChange: (v: number[]) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-ink-100 text-sm font-medium">{label}</legend>
      <p className="text-ink-500 text-xs">{help}</p>
      <div className="mt-1 grid grid-cols-4 gap-1.5">
        {COMPASS_8.map((d) => {
          const on = value.includes(d.degrees)
          return (
            <button
              key={d.label}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on ? value.filter((x) => x !== d.degrees) : [...value, d.degrees],
                )
              }
              className={cn(
                'min-h-11 rounded-md border text-sm',
                on
                  ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                  : 'border-surface-600 text-ink-300',
              )}
            >
              {d.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Point GPS, période, rayon, objectif et réglages avancés (avec retour aux valeurs par défaut). */
export function ParamsPanel({ onRun, busy }: { onRun: () => void; busy: boolean }) {
  const inputs = useHuntStore((s) => s.inputs)
  const setInputs = useHuntStore((s) => s.setInputs)
  const resetAdvanced = useHuntStore((s) => s.resetAdvanced)
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const [gpsMessage, setGpsMessage] = useState<string | null>(null)
  const [latText, setLatText] = useState(inputs.coordinate?.lat.toFixed(5) ?? '')
  const [lngText, setLngText] = useState(inputs.coordinate?.lng.toFixed(5) ?? '')

  function applyText(lat: string, lng: string) {
    setLatText(lat)
    setLngText(lng)
    const la = Number(lat.replace(',', '.'))
    const ln = Number(lng.replace(',', '.'))
    if (
      lat.trim() !== '' &&
      lng.trim() !== '' &&
      Number.isFinite(la) &&
      Number.isFinite(ln) &&
      Math.abs(la) <= 90 &&
      Math.abs(ln) <= 180
    ) {
      setInputs({ coordinate: { lat: la, lng: ln } })
    } else {
      setInputs({ coordinate: null })
    }
  }

  function useMyPosition() {
    if (!('geolocation' in navigator)) {
      setGpsMessage('La géolocalisation n’est pas disponible sur cet appareil.')
      return
    }
    setGpsMessage('Recherche du signal GPS…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyText(pos.coords.latitude.toFixed(5), pos.coords.longitude.toFixed(5))
        setGpsMessage(
          `Position obtenue (précision ± ${Math.round(pos.coords.accuracy)} m).`,
        )
      },
      (err) =>
        setGpsMessage(
          err.code === 1
            ? 'Autorisation de localisation refusée.'
            : 'Position indisponible pour le moment.',
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    )
  }

  const coordinateValid = inputs.coordinate !== null
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label="Point GPS">
        <h2 className="text-ink-100 text-sm font-semibold">Point GPS</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-ink-300 text-xs">
            Latitude
            <input
              inputMode="decimal"
              className={field}
              value={latText}
              onChange={(e) => applyText(e.target.value, lngText)}
              aria-label="Latitude"
            />
          </label>
          <label className="text-ink-300 text-xs">
            Longitude
            <input
              inputMode="decimal"
              className={field}
              value={lngText}
              onChange={(e) => applyText(latText, e.target.value)}
              aria-label="Longitude"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={useMyPosition}>
            <LocateFixed size={16} aria-hidden="true" />
            Ma position
          </Button>
          {waypoints.length > 0 && (
            <select
              aria-label="Utiliser un repère"
              className={cn(field, 'w-auto')}
              value=""
              onChange={(e) => {
                const wp = waypoints.find((w) => w.id === e.target.value)
                if (wp)
                  applyText(wp.coordinate.lat.toFixed(5), wp.coordinate.lng.toFixed(5))
              }}
            >
              <option value="">Depuis un repère…</option>
              {waypoints.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {gpsMessage && <p className="text-ink-500 text-xs">{gpsMessage}</p>}
        {!coordinateValid && (latText !== '' || lngText !== '') && (
          <p className="text-status-warning text-xs">Coordonnées invalides.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2" aria-label="Période et rayon">
        <label className="text-ink-300 text-xs">
          Premier jour
          <input
            type="date"
            className={field}
            value={inputs.startDateKey ?? ''}
            onChange={(e) => setInputs({ startDateKey: e.target.value || null })}
          />
          <span className="text-ink-600">Vide = aujourd’hui au lieu choisi.</span>
        </label>
        <label className="text-ink-300 text-xs">
          Jours (1–7)
          <input
            type="number"
            min={1}
            max={7}
            className={field}
            value={inputs.days}
            onChange={(e) =>
              setInputs({
                days: Math.min(7, Math.max(1, Math.round(Number(e.target.value) || 1))),
              })
            }
          />
        </label>
        <label className="text-ink-300 col-span-2 text-xs">
          Rayon d’analyse : {inputs.radiusM} m
          <input
            type="range"
            min={300}
            max={3000}
            step={100}
            className="w-full"
            value={inputs.radiusM}
            onChange={(e) => setInputs({ radiusM: Number(e.target.value) })}
          />
        </label>
        <label className="text-ink-300 col-span-2 text-xs">
          Objectif
          <select
            className={field}
            value={inputs.objective}
            onChange={(e) =>
              setInputs({ objective: e.target.value as typeof inputs.objective })
            }
          >
            <option value="poste">Poste (affût)</option>
            <option value="observation">Observation</option>
            <option value="prospection">Prospection</option>
          </select>
        </label>
      </section>

      <details className="border-surface-700 rounded-md border p-3">
        <summary className="text-ink-100 min-h-11 cursor-pointer text-sm font-semibold">
          Réglages avancés (heuristiques)
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <DirectionPicker
            label="Vents favorables au poste (provenance)"
            help="Vide = inconnu : la compatibilité du vent est alors « non évaluée »."
            value={inputs.favorableWindFrom}
            onChange={(v) => setInputs({ favorableWindFrom: v })}
          />
          <DirectionPicker
            label="Direction de la zone sensible (depuis le poste)"
            help="Zone de repos ou d’alimentation à ne pas déranger. Vide = non renseignée."
            value={inputs.sensitiveBearings}
            onChange={(v) => setInputs({ sensitiveBearings: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-ink-300 text-xs">
              Disponible dès
              <input
                type="time"
                className={field}
                value={
                  inputs.availability
                    ? minutesToTime(inputs.availability.startMinutes)
                    : ''
                }
                onChange={(e) => {
                  const m = timeToMinutes(e.target.value)
                  setInputs({
                    availability:
                      m === null
                        ? null
                        : {
                            startMinutes: m,
                            endMinutes: inputs.availability?.endMinutes ?? 1440,
                          },
                  })
                }}
              />
            </label>
            <label className="text-ink-300 text-xs">
              Jusqu’à
              <input
                type="time"
                className={field}
                value={
                  inputs.availability
                    ? minutesToTime(inputs.availability.endMinutes % 1440)
                    : ''
                }
                onChange={(e) => {
                  const m = timeToMinutes(e.target.value)
                  setInputs({
                    availability:
                      m === null
                        ? null
                        : {
                            startMinutes: inputs.availability?.startMinutes ?? 0,
                            endMinutes: m,
                          },
                  })
                }}
              />
            </label>
          </div>
          <label className="text-ink-300 text-xs">
            Plage de planification
            <select
              className={field}
              value={inputs.huntingRuleId ?? ''}
              onChange={(e) =>
                setInputs({
                  huntingRuleId: e.target.value === '' ? null : 'quebec-general',
                })
              }
            >
              <option value="">
                Générale : 30 min avant le lever → 30 min après le coucher
              </option>
              <option value="quebec-general">Heures de chasse du Québec (±30 min)</option>
            </select>
            <span className="text-ink-600">
              Une plage calculée n’est pas une autorisation : à vérifier sur la source
              officielle.
            </span>
          </label>
          <label className="text-ink-300 text-xs">
            Nombre de points candidats : {inputs.maxCandidates}
            <input
              type="range"
              min={1}
              max={10}
              className="w-full"
              value={inputs.maxCandidates}
              onChange={(e) => setInputs({ maxCandidates: Number(e.target.value) })}
            />
          </label>
          <label className="text-ink-300 flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={inputs.experimentalSolunar}
              onChange={(e) => setInputs({ experimentalSolunar: e.target.checked })}
            />
            <span>
              Hypothèse solunaire (expérimental)
              <span className="text-ink-500 block text-xs">
                Résultats contradictoires dans la littérature ; influence bornée à ±6
                points, comparaison avec/sans toujours affichée.
              </span>
            </span>
          </label>
          <p className="text-ink-500 text-xs">
            Observations (journal, repères, traces) : non utilisées. L’analyse fonctionne
            sans.
          </p>
          <Button type="button" variant="ghost" onClick={resetAdvanced}>
            Rétablir les valeurs par défaut
          </Button>
        </div>
      </details>

      <Button type="button" size="lg" onClick={onRun} disabled={!coordinateValid || busy}>
        {busy ? 'Calcul en cours…' : 'Analyser'}
      </Button>
    </div>
  )
}
