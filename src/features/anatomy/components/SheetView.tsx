import type { ShotSpecies } from '@/types'
import { SHOT_SPECIES_LABEL } from '@/features/aftershot/shotLogic'
import { sourceById } from '../content/sources'
import { ANATOMY_CONTENT_VERSION, ANATOMY_REVISION_DATE } from '../content/meta'
import type { AnatomySheet } from '../types'

const KIND_LABEL: Record<AnatomySheet['kind'], string> = {
  anatomie: 'Anatomie',
  observations: 'Observations au moment du tir',
  indices: 'Indices retrouvés',
  organisation: 'Organisation de la recherche',
  limites: 'Limites d’interprétation',
}

/** One sourced sheet. Sources, content version, revision date, context and
 * uncertainty are always shown with the text. */
export function SheetView({
  sheet,
  species,
}: {
  sheet: AnatomySheet
  species: ShotSpecies
}) {
  const applicability = sheet.applicability[species]
  return (
    <details
      data-testid="anatomy-sheet"
      data-sheet-id={sheet.id}
      className="border-surface-700 bg-surface-800 rounded-lg border"
    >
      <summary className="text-ink-100 flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1 text-sm font-semibold">
        <span>{sheet.title}</span>
        <span className="text-ink-500 text-xs font-normal">{KIND_LABEL[sheet.kind]}</span>
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3 text-sm">
        {applicability === 'non confirmé' && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            Les sources de cette fiche ne portent pas sur{' '}
            {SHOT_SPECIES_LABEL[species].toLowerCase()} : l’application à cette espèce
            n’est pas confirmée.
          </p>
        )}
        {sheet.body.map((paragraph, index) => (
          <p key={index} className="text-ink-100">
            {paragraph}
          </p>
        ))}
        <p className="text-ink-300 text-xs">
          <strong>Contexte :</strong> {sheet.context}
        </p>
        <p className="text-ink-300 text-xs">
          <strong>Incertitudes :</strong> {sheet.uncertainty}
        </p>
        <div className="text-ink-300 text-xs">
          <strong>Sources :</strong>
          <ul className="mt-1 flex flex-col gap-1">
            {sheet.sourceIds.map((id) => {
              const source = sourceById(id)
              if (!source) return null
              return (
                <li key={id} data-testid="sheet-source">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-400 underline"
                  >
                    {source.title}
                  </a>{' '}
                  — {source.publisher} ({source.kind}), consultée le {source.retrievedOn}
                </li>
              )
            })}
          </ul>
        </div>
        <p className="text-ink-500 text-xs">
          Version du contenu : {ANATOMY_CONTENT_VERSION} · révision du{' '}
          {ANATOMY_REVISION_DATE} · non relu par un spécialiste.
        </p>
      </div>
    </details>
  )
}
