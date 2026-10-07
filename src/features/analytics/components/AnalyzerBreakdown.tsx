import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatContribution, formatDataTime } from './analyzerFormat'
import { cn } from '@/utils/cn'
import { ANALYZER_LABEL, FAMILY_HINT, FAMILY_LABEL } from '@/utils/analysisFamilies'
import { formatCellMeters } from '@/utils/grid'
import type {
  AnalysisCoverage,
  AnalysisFactor,
  AnalysisFamily,
  AnalyzerResult,
  DataConfidence,
  FamilyResult,
} from '@/types'

const CONFIDENCE_LABEL: Record<DataConfidence, string> = {
  measured: 'mesuré',
  calculated: 'calculé',
  estimated: 'estimé',
  ai_interpretation: 'interprétation de l’IA',
  user_observation: 'observation de l’utilisateur',
}

function SourceBlock({ factors }: { factors: AnalysisFactor[] }) {
  const first = factors[0]
  if (!first) return null
  const resolution =
    first.resolutionMeters === null
      ? 'un seul point pour toute la zone'
      : first.resolutionMeters !== undefined
        ? `≈ ${formatCellMeters(first.resolutionMeters)}`
        : null
  return (
    <dl
      data-testid="analyzer-source"
      className="border-surface-700 bg-surface-800/60 mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-md border p-2 text-[11px]"
    >
      {first.source && (
        <>
          <dt className="text-ink-600">Source</dt>
          <dd className="text-ink-300 min-w-0 break-words">{first.source}</dd>
        </>
      )}
      {first.dataTime && (
        <>
          <dt className="text-ink-600">Donnée du</dt>
          <dd className="text-ink-300">{formatDataTime(first.dataTime)}</dd>
        </>
      )}
      {resolution && (
        <>
          <dt className="text-ink-600">Résolution</dt>
          <dd className="text-ink-300">{resolution}</dd>
        </>
      )}
      <dt className="text-ink-600">Règle</dt>
      <dd className="text-ink-300">
        moyenne simple des facteurs comptés (poids 1 chacun)
      </dd>
      {first.limits && (
        <>
          <dt className="text-ink-600">Limites</dt>
          <dd className="text-ink-300 min-w-0 break-words">{first.limits}</dd>
        </>
      )}
    </dl>
  )
}

function FactorRow({ factor }: { factor: AnalysisFactor }) {
  const informational = factor.scored === false
  return (
    <div className="text-xs">
      <p className="text-ink-200 font-medium break-words">
        {factor.label}
        <span className="text-ink-600 ml-1 font-normal">
          ({CONFIDENCE_LABEL[factor.confidence]})
        </span>
      </p>
      <p className="mt-0.5 flex flex-wrap gap-1">
        {informational ? (
          <span className="bg-surface-700 text-ink-300 rounded px-1.5 py-0.5 text-[10px]">
            information, non comptée
          </span>
        ) : (
          <span className="bg-surface-700 text-ink-300 rounded px-1.5 py-0.5 text-[10px]">
            effet {formatContribution(factor.contribution)} · poids {factor.weight ?? 1}
          </span>
        )}
        {factor.timeLabel &&
          factor.timeKind !== 'static' &&
          factor.timeKind !== 'record' && (
            <span className="bg-brand-500/15 text-brand-400 rounded px-1.5 py-0.5 text-[10px]">
              {factor.timeLabel}
            </span>
          )}
        {factor.uniformAcrossArea && (
          <span className="bg-surface-700 text-ink-300 rounded px-1.5 py-0.5 text-[10px]">
            identique sur toute la zone
          </span>
        )}
        {factor.unverified && (
          <span className="bg-status-warning/15 text-status-warning rounded px-1.5 py-0.5 text-[10px]">
            indice populaire non vérifié
          </span>
        )}
      </p>
      <p className="text-ink-500 mt-0.5 break-words">{factor.explanation}</p>
    </div>
  )
}

export function AnalyzerCard({ result }: { result: AnalyzerResult }) {
  const [expanded, setExpanded] = useState(false)
  const reason = result.unavailableReason ?? result.noSignalReason

  return (
    <div className="border-surface-700 rounded-md border p-2.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 text-left pointer-coarse:min-h-11"
        aria-expanded={expanded}
      >
        <span className="text-ink-100 text-sm font-medium">
          {ANALYZER_LABEL[result.analyzer]}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {result.score !== null ? (
            <span className="text-ink-300 text-xs">{Math.round(result.score)}/100</span>
          ) : (
            <span className="text-ink-500 text-xs">
              {result.covered ? 'Aucun signal' : 'Aucune donnée'}
            </span>
          )}
          {expanded ? (
            <ChevronUp size={14} className="text-ink-500" aria-hidden="true" />
          ) : (
            <ChevronDown size={14} className="text-ink-500" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5">
          {result.score === null && reason && (
            <p className="text-ink-500 text-xs break-words">{reason}</p>
          )}
          {result.factors.map((factor, i) => (
            <FactorRow key={i} factor={factor} />
          ))}
          <SourceBlock factors={result.factors} />
        </div>
      )}
    </div>
  )
}

/** « 5 groupes de facteurs sur 6 renseignés — manque : Végétation ».
 * Remplace tout « pourcentage de confiance » : on dit ce qui est connu,
 * pas un degré de certitude inventé. */
export function CoverageLine({ coverage }: { coverage: AnalysisCoverage }) {
  return (
    <p data-testid="coverage-line" className="text-ink-300 text-xs">
      {coverage.available} groupe{coverage.available > 1 ? 's' : ''} de facteurs sur{' '}
      {coverage.total} renseigné{coverage.available > 1 ? 's' : ''}
      {coverage.missing.length > 0 && (
        <span className="text-ink-500">
          {' '}
          — manque : {coverage.missing.map((id) => ANALYZER_LABEL[id]).join(', ')}
        </span>
      )}
    </p>
  )
}

/** Un groupe de la famille : titre, indice de la famille (ou « aucun
 * signal »), couverture, puis les cartes d'analyseurs. */
export function FamilySection({
  family,
  summary,
  results,
}: {
  family: AnalysisFamily
  summary: FamilyResult | undefined
  results: AnalyzerResult[]
}) {
  const members = results.filter((r) => summary?.analyzers.includes(r.analyzer))
  if (members.length === 0) return null
  return (
    <section
      aria-label={`Famille ${FAMILY_LABEL[family]}`}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-ink-100 text-xs font-semibold tracking-wide uppercase">
          {FAMILY_LABEL[family]}
        </h3>
        <span
          className={cn(
            'text-xs',
            summary?.score != null ? 'text-ink-300' : 'text-ink-500',
          )}
        >
          {summary?.score != null
            ? `indice ${Math.round(summary.score)}/100`
            : 'aucun indice'}
          {summary
            ? ` · ${summary.coverage.available}/${summary.coverage.total} renseigné${summary.coverage.total > 1 ? 's' : ''}`
            : ''}
        </span>
      </div>
      <p className="text-ink-600 text-[11px]">{FAMILY_HINT[family]}</p>
      {members.map((result) => (
        <AnalyzerCard key={result.analyzer} result={result} />
      ))}
    </section>
  )
}
