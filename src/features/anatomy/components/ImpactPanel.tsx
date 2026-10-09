import { useId } from 'react'
import {
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eye,
  FileText,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import { generalSheets, sheetsFor } from '../content/sheets'
import { isSheetPublished } from '../content/publication'
import { POINT_2D_LIMIT } from '../content/meta'
import type { AnatomyRegion, Illustration } from '../types'
import { SheetView } from './SheetView'

const OBSERVATIONS_TO_RECORD = [
  'l’heure du tir et la position où vous étiez',
  'ce que vous avez vu de la réaction de l’animal (vos mots)',
  'la direction dans laquelle il est parti, si vous l’avez vue',
  'les bruits entendus',
  'les indices retrouvés : où, quand, couleur vue, photo',
]

interface Props {
  illustration: Illustration
  region: AnatomyRegion | null
  hasPoint: boolean
  open: boolean
  onToggle: () => void
  note: string
  onNote: (note: string) => void
  onSave: () => void
  saveDisabled: boolean
  saveHint: string | null
  onOpenShot: () => void
  onOpenClues: () => void
  onOpenCamera: () => void
  onLastClue: () => void
  hasLastClue: boolean
  /** Layout: a bottom sheet, or a side column in short landscape. */
  className?: string
}

/** Results of the selection. Collapsible, never closed by a gesture on the
 * drawing: only its own button folds it. The save button stays in the header
 * so it is visible folded or open. */
export function ImpactPanel({
  illustration,
  region,
  hasPoint,
  open,
  onToggle,
  note,
  onNote,
  onSave,
  saveDisabled,
  saveHint,
  onOpenShot,
  onOpenClues,
  onOpenCamera,
  onLastClue,
  hasLastClue,
  className,
}: Props) {
  const bodyId = useId()
  const noteId = useId()
  const sheets = sheetsFor(region?.id ?? null).filter(isSheetPublished)
  const general = generalSheets().filter(isSheetPublished)
  const drawn = region
    ? illustration.structures.filter((s) => region.drawn.includes(s.id))
    : []

  return (
    <section
      aria-label="Résultats de la sélection"
      data-testid="impact-panel"
      data-open={open}
      className={cn(
        'border-surface-600 bg-surface-900 flex min-h-0 min-w-0 flex-col rounded-xl border',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="text-ink-100 flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold"
        >
          {open ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronUp size={18} aria-hidden="true" />
          )}
          <span className="min-w-0 truncate" data-testid="panel-region">
            {!hasPoint
              ? 'Aucun point choisi'
              : region
                ? `Région : ${region.label}`
                : 'Point hors des régions dessinées'}
          </span>
        </button>
        <Button
          variant="primary"
          size="md"
          onClick={onSave}
          disabled={saveDisabled}
          data-testid="save-impact"
          className="shrink-0"
        >
          <Save size={16} aria-hidden="true" /> Enregistrer
        </Button>
      </div>
      {saveHint && (
        <p className="text-ink-300 px-3 pb-2 text-xs" data-testid="save-hint">
          {saveHint}
        </p>
      )}

      <div
        id={bodyId}
        hidden={!open}
        className="flex min-h-0 flex-col gap-3 overflow-y-auto [overscroll-behavior:contain] px-3 pb-4 text-sm"
      >
        <p className="text-ink-300 text-xs" data-testid="anatomy-disclaimer">
          Schéma d’orientation : l’application ne diagnostique rien et n’estime ni survie,
          ni distance de fuite, ni position de l’animal, ni délai d’attente.
        </p>
        {!hasPoint ? (
          <p className="text-ink-300">
            Touchez le dessin ou choisissez une région dans la liste pour placer un point.
            Rien n’est enregistré tant que vous n’appuyez pas sur « Enregistrer ».
          </p>
        ) : (
          <>
            <p className="text-ink-100">
              Point présumé placé par vous. C’est une estimation manuelle, pas un constat.
            </p>

            <div data-testid="nearby-structures" className="flex flex-col gap-1">
              <h3 className="text-ink-100 font-semibold">
                Structures représentées à proximité
              </h3>
              {drawn.length > 0 ? (
                <ul className="text-ink-300 list-disc pl-5">
                  {drawn.map((s) => (
                    <li key={s.id}>
                      {s.label} — {s.note}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-300">
                  Aucune structure dessinée dans cette région du schéma.
                </p>
              )}
              {region && region.mentioned.length > 0 && (
                <p className="text-ink-300 text-xs">
                  Citées par les sources consultées pour ce type de zone, mais non
                  localisées sur le dessin : {region.mentioned.join(', ')}.
                </p>
              )}
            </div>

            <p className="text-ink-300 border-surface-700 rounded border p-2 text-xs">
              {POINT_2D_LIMIT}
            </p>

            <div className="flex flex-col gap-2">
              <h3 className="text-ink-100 font-semibold">Fiches sourcées</h3>
              {sheets.length === 0 ? (
                <p className="text-ink-300" data-testid="no-sheet">
                  Aucune fiche publiée pour cette région : les sources consultées ne la
                  traitent pas assez pour être citées.
                </p>
              ) : (
                sheets.map((sheet) => (
                  <SheetView
                    key={sheet.id}
                    sheet={sheet}
                    species={illustration.species}
                  />
                ))
              )}
              {general.map((sheet) => (
                <SheetView key={sheet.id} sheet={sheet} species={illustration.species} />
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-ink-100 font-semibold">Observations à consigner</h3>
              <ul className="text-ink-300 list-disc pl-5">
                {OBSERVATIONS_TO_RECORD.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={noteId} className="text-ink-100 font-semibold">
                Note sur ce point
              </label>
              <textarea
                id={noteId}
                value={note}
                rows={2}
                maxLength={500}
                onChange={(event) => onNote(event.target.value)}
                className="border-surface-600 bg-surface-800 text-ink-100 w-full rounded-lg border px-3 py-2 text-base"
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2" aria-label="Outils de recherche">
          <Button variant="secondary" size="md" onClick={onOpenShot}>
            <FileText size={16} aria-hidden="true" /> Dossier du tir
          </Button>
          <Button variant="secondary" size="md" onClick={onOpenClues}>
            <ClipboardList size={16} aria-hidden="true" /> Consigner un indice
          </Button>
          <Button variant="secondary" size="md" onClick={onOpenCamera}>
            <Camera size={16} aria-hidden="true" /> Caméra sang
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onLastClue}
            disabled={!hasLastClue}
          >
            <Eye size={16} aria-hidden="true" /> Dernier indice
          </Button>
        </div>
      </div>
    </section>
  )
}
