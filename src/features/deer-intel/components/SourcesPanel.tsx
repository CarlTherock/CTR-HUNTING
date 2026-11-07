import { Badge, Card } from '@/components/ui'
import { ENGINE_VERSION } from '../engine'
import {
  PROVENANCE_LABEL,
  RULE_REGISTRY,
  RULE_REGISTRY_VERSION,
  type BibliographyEntry,
  BIBLIOGRAPHY,
} from '../rules/registry'
import type { SavedHuntAnalysis } from '@/types'
import { ServiceCheck } from './ServiceCheck'

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  informatif: 'Informative',
  experimental: 'Expérimentale',
  non_pris_en_charge: 'Non prise en charge',
}
const CATEGORY_LABEL: Record<string, string> = {
  A: 'Résultat applicable',
  B: 'Autre contexte',
  C: 'Conseil de praticien',
  D: 'Heuristique',
}
const ACCESS_LABEL: Record<BibliographyEntry['verification'], string> = {
  corps_recupere: 'Texte principal récupéré',
  lecture_substantielle: 'Lecture substantielle',
  partiel: 'Partiel',
  notice_seulement: 'Notice seulement',
  non_lu: 'Non lu',
}

/** Sources, règles (statut, catégorie), limites et dates des données : tout est visible. */
export function SourcesPanel({ record }: { record: SavedHuntAnalysis }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3 text-sm">
        <h2 className="text-ink-100 font-semibold">Limites</h2>
        <ul className="text-ink-300 mt-1 list-disc pl-5">
          {[...record.hunt.limits, ...(record.spatial?.limits ?? [])].map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="text-ink-500 mt-2 text-xs">
          Indice comparatif non validé au Québec : les tests vérifient le code, pas la
          précision biologique.
        </p>
      </Card>

      <Card className="p-3 text-sm">
        <h2 className="text-ink-100 font-semibold">Services de données</h2>
        <p className="text-ink-300 mt-1">
          Météo : Open-Meteo. Occupation du sol : OpenStreetMap via Overpass.
        </p>
        <ServiceCheck />
      </Card>

      <Card className="p-3 text-sm">
        <h2 className="text-ink-100 font-semibold">Données et versions</h2>
        <dl className="text-ink-300 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>Moteur</dt>
          <dd>
            {record.engineVersion} (courant {ENGINE_VERSION}) · registre{' '}
            {record.registryVersion} (courant {RULE_REGISTRY_VERSION})
          </dd>
          <dt>Météo</dt>
          <dd>
            {record.data.forecastSource
              ? `${record.data.forecastSource}, récupérée le ${record.data.forecastFetchedAt?.slice(0, 16).replace('T', ' ')} (UTC)`
              : 'absente'}
          </dd>
          <dt>Occupation du sol</dt>
          <dd>
            {record.data.landCoverSource
              ? `${record.data.landCoverSource}, récupérée le ${record.data.landCoverFetchedAt?.slice(0, 16).replace('T', ' ')} (UTC)`
              : 'absente'}
          </dd>
          <dt>Calcul astronomique</dt>
          <dd>Local (SunCalc), sans réseau</dd>
        </dl>
      </Card>

      <section aria-label="Règles">
        <h2 className="text-ink-100 mb-2 text-sm font-semibold">Règles du moteur</h2>
        <p className="text-ink-500 mb-2 text-xs">
          {PROVENANCE_LABEL}. Aucun coefficient publié n’est transcrit.
        </p>
        <ul className="flex flex-col gap-2">
          {RULE_REGISTRY.map((r) => (
            <li key={r.id}>
              <details className="border-surface-700 bg-surface-900 rounded-md border p-3">
                <summary className="min-h-11 cursor-pointer text-sm">
                  <span className="text-ink-100 font-medium">{r.title}</span>{' '}
                  <Badge>{STATUS_LABEL[r.status]}</Badge>{' '}
                  <Badge>{CATEGORY_LABEL[r.category]}</Badge>
                </summary>
                <div className="text-ink-300 mt-2 flex flex-col gap-1 text-sm">
                  <p>
                    <strong>{r.id}</strong> — {r.result}
                  </p>
                  <p>Domaine : {r.domain}</p>
                  <p>Limites de transfert : {r.transferLimits}</p>
                  <p>Coefficient : {r.coefficientNote}</p>
                  {r.sources.map((s) => (
                    <p key={s.citation} className="text-ink-500 text-xs">
                      {s.citation} — {ACCESS_LABEL[s.verification]}
                      {s.locator ? ` (${s.locator})` : ''}
                    </p>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Niveau de lecture des références">
        <h2 className="text-ink-100 mb-2 text-sm font-semibold">Références (R01–R19)</h2>
        <p className="text-ink-500 mb-2 text-xs">
          Aucune référence n’est présentée comme lue intégralement.
        </p>
        <ul className="flex flex-col gap-1.5 text-xs">
          {BIBLIOGRAPHY.map((b) => (
            <li key={b.ref} className="text-ink-300">
              <strong>{b.ref}</strong> {b.citation} —{' '}
              <em>{ACCESS_LABEL[b.verification]}</em>. Manque : {b.missing}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
