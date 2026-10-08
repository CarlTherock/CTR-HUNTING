import {
  formatContribution,
  formatDataTime,
  scoreLabel,
} from '@/features/analytics/components/analyzerFormat'
import { diffAnalyses } from '@/features/analytics/cellDiff'
import {
  ANALYZER_FAMILY,
  ANALYZER_LABEL,
  FAMILY_LABEL,
  FAMILY_ORDER,
  isCovered,
} from '@/utils/analysisFamilies'
import type {
  AnalysisFactor,
  AnalyzerResult,
  CombinedAnalysis,
  Coordinate,
} from '@/types'
import { deterministicNatureOf } from './nature'
import { ResultBuilder } from './resultBuilder'
import { cleanText, formatDateTime } from './text'
import type { AssistantResult, EntityRef } from './types'

/** Une analyse à expliquer : cellule de la carte de potentiel ou point analysé. */
export interface ExplainSubject {
  ref: EntityRef
  combined: CombinedAnalysis
  coordinate: Coordinate
  /** « actuel », « prévision pour 18:00 »… */
  hourLabel?: string
  /** ISO : quand les données ont été demandées. */
  computedAt?: string | null
  /** « ≈ 280 m × 310 m » pour une cellule. */
  sizeText?: string
}

export interface ExplainInput {
  subject: ExplainSubject
  /** Seconde analyse : active la section « pourquoi elles diffèrent ». */
  other?: ExplainSubject | null
  now?: Date
}

const fmt = (value: number) => Math.round(value).toString()
const weightText = (f: AnalysisFactor) => (f.weight ?? 1).toString().replace('.', ',')

function factorDetail(factor: AnalysisFactor): string {
  const parts: string[] = []
  if (factor.source) parts.push(`source : ${cleanText(factor.source, 80)}`)
  const when = factor.timeLabel
    ? cleanText(factor.timeLabel, 60)
    : factor.dataTime
      ? `donnée du ${formatDataTime(factor.dataTime)}`
      : null
  if (when) parts.push(when)
  if (factor.resolutionMeters) {
    parts.push(`résolution ≈ ${Math.round(factor.resolutionMeters)} m`)
  }
  if (factor.uniformAcrossArea) parts.push('même valeur pour toute la zone')
  if (factor.unverified) parts.push('indice populaire non vérifié')
  if (factor.limits) parts.push(`limite : ${cleanText(factor.limits, 160)}`)
  return parts.length > 0 ? ` (${parts.join(' · ')})` : ''
}

function factorLine(factor: AnalysisFactor): string {
  const counted = factor.scored !== false
  const head = counted
    ? `${cleanText(factor.label, 80)} : contribution ${formatContribution(factor.contribution)} (poids ${weightText(factor)})`
    : `${cleanText(factor.label, 80)} : information, non comptée dans le score`
  return `${head} — ${cleanText(factor.explanation, 240)}${factorDetail(factor)}`
}

function describeResult(result: AnalyzerResult): string {
  const name = ANALYZER_LABEL[result.analyzer]
  if (result.score !== null) {
    const counted = result.factors.filter((f) => f.scored !== false).length
    return `${name} : ${fmt(result.score)}/100 (${scoreLabel(result.score)}), moyenne pondérée de ${counted} facteur(s) compté(s).`
  }
  if (isCovered(result)) {
    return `${name} : donnée présente mais aucune règle ne s'est déclenchée, donc aucun score${result.noSignalReason ? ` — ${cleanText(result.noSignalReason, 200)}` : ''}.`
  }
  return `${name} : donnée manquante, aucun score${result.unavailableReason ? ` — ${cleanText(result.unavailableReason, 200)}` : ''}.`
}

function addSubject(builder: ResultBuilder, subject: ExplainSubject, title: string) {
  const { combined, ref } = subject
  builder.used(`${title} (${ref.label})`)
  if (subject.computedAt) {
    builder.date(`Données demandées (${ref.label})`, formatDateTime(subject.computedAt))
  }
  if (subject.hourLabel) builder.date(`Heure analysée (${ref.label})`, subject.hourLabel)

  for (const result of combined.results) {
    for (const f of result.factors) {
      builder.factor({
        group: ANALYZER_LABEL[result.analyzer],
        label: cleanText(f.label, 80),
        contribution: f.contribution,
        weight: f.weight ?? 1,
        counted: f.scored !== false,
        nature: deterministicNatureOf(f.confidence),
        source: f.source ? cleanText(f.source, 80) : null,
      })
    }
    if (!isCovered(result)) {
      builder.missingData(
        `${ANALYZER_LABEL[result.analyzer]} (${ref.label}) : ${result.unavailableReason ? cleanText(result.unavailableReason, 200) : 'donnée manquante'}`,
      )
    } else if (result.score === null && result.noSignalReason) {
      builder.missingData(
        `${ANALYZER_LABEL[result.analyzer]} (${ref.label}) : ${cleanText(result.noSignalReason, 200)}`,
      )
    }
  }
}

function explainOne(builder: ResultBuilder, subject: ExplainSubject) {
  const { combined, ref } = subject

  const head = builder.section(`Résultat — ${ref.label}`)
  if (combined.overallScore !== null) {
    head.calc(
      `Indice de repère ${fmt(combined.overallScore)}/100 (${scoreLabel(combined.overallScore)}) : moyenne simple des scores des groupes qui ont un score. C'est un repère comparatif entre cellules, pas une probabilité de présence, de déplacement ni de récolte.`,
      [ref],
    )
  } else {
    head.calc(
      "Aucun indice : aucun groupe d'analyse n'a de score, faute de donnée exploitable. Aucune valeur n'est inventée pour combler.",
      [ref],
    )
  }
  if (subject.hourLabel) {
    head.calc(
      `Les facteurs de vent et de météo portent sur : ${cleanText(subject.hourLabel, 80)}.`,
      [ref],
    )
  }
  if (subject.computedAt) {
    head.fact(
      `Données demandées le ${formatDateTime(subject.computedAt)}. Elles ne sont pas rafraîchies automatiquement.`,
      [ref],
    )
  }
  if (subject.sizeText) head.calc(`Étendue de la cellule : ${subject.sizeText}.`, [ref])
  if (combined.coverage) {
    head.calc(
      `Couverture : ${combined.coverage.available}/${combined.coverage.total} groupes renseignés.`,
      [ref],
    )
  }

  const rules = builder.section('Comment le score est construit')
  rules.calc(
    'Chaque facteur compté contribue de −1 (défavorable) à +1 (favorable). Le score d’un groupe vaut 50 + 50 × (moyenne pondérée des contributions), borné entre 0 et 100.',
  )
  rules.calc(
    'L’indice combiné est la moyenne simple des scores des groupes qui en ont un. Un groupe sans donnée n’est jamais remplacé par une valeur neutre : il ne compte ni pour ni contre.',
  )

  for (const family of FAMILY_ORDER) {
    const summary = combined.families?.find((f) => f.family === family)
    const members = combined.results.filter((r) => ANALYZER_FAMILY[r.analyzer] === family)
    if (members.length === 0) continue
    const scoreText =
      summary && summary.score !== null ? `${fmt(summary.score)}/100` : 'sans score'
    const coverage = summary
      ? ` · ${summary.coverage.available}/${summary.coverage.total} renseigné(s)`
      : ''
    const section = builder.section(`${FAMILY_LABEL[family]} — ${scoreText}${coverage}`)
    for (const result of members) {
      section.add(describeResult(result), 'calcul', [ref])
      for (const factor of result.factors) {
        section.add(factorLine(factor), deterministicNatureOf(factor.confidence), [ref])
      }
    }
  }

  const limits = builder.section('Limites')
  const uniform = combined.results.flatMap((r) =>
    r.factors.filter((f) => f.uniformAcrossArea).map((f) => cleanText(f.label, 80)),
  )
  if (uniform.length > 0) {
    limits.calc(
      `Facteurs identiques pour toute la zone (ils ne peuvent pas expliquer une différence entre deux cellules) : ${uniform.join(', ')}.`,
      [ref],
    )
  }
  const unverified = combined.results.flatMap((r) =>
    r.factors.filter((f) => f.unverified).map((f) => cleanText(f.label, 80)),
  )
  if (unverified.length > 0) {
    limits.calc(
      `Indices populaires non vérifiés scientifiquement : ${unverified.join(', ')}.`,
      [ref],
    )
  }
  limits.calc(
    'Analyse environnementale générale : aucun profil d’espèce. Les entrées de journal sont du texte libre et ne sont jamais interprétées.',
  )
}

function explainDifference(builder: ResultBuilder, a: ExplainSubject, b: ExplainSubject) {
  const diff = diffAnalyses(a.combined, b.combined)
  const section = builder.section(`Pourquoi ${a.ref.label} et ${b.ref.label} diffèrent`)
  const refs = [a.ref, b.ref]

  if (diff.overall.a === null || diff.overall.b === null) {
    section.calc(
      'Au moins une des deux analyses n’a pas d’indice : l’écart global ne peut pas être calculé.',
      refs,
    )
  } else {
    const delta = diff.overall.delta ?? 0
    section.calc(
      `Indice global : ${fmt(diff.overall.a)}/100 contre ${fmt(diff.overall.b)}/100, écart de ${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} points.`,
      refs,
    )
  }
  for (const fam of diff.families) {
    if (fam.delta === null || Math.abs(fam.delta) < 0.5) continue
    section.calc(
      `Famille ${FAMILY_LABEL[fam.family]} : ${fmt(fam.a ?? 0)} contre ${fmt(fam.b ?? 0)} (écart ${fam.delta >= 0 ? '+' : '−'}${fmt(Math.abs(fam.delta))}).`,
      refs,
    )
  }
  if (diff.differing.length === 0) {
    section.calc('Aucun facteur compté ne diffère entre les deux analyses.', refs)
  } else {
    for (const d of diff.differing.slice(0, 6)) {
      const left = d.a === null ? 'absent' : formatContribution(d.a)
      const right = d.b === null ? 'absent' : formatContribution(d.b)
      section.calc(
        `${ANALYZER_LABEL[d.analyzer]} — ${cleanText(d.label, 80)} : ${left} contre ${right}.`,
        refs,
      )
    }
    if (diff.differing.length > 6) {
      section.calc(
        `${diff.differing.length - 6} autre(s) facteur(s) diffèrent, moins influent(s).`,
        refs,
      )
    }
  }
  if (diff.sharedUniform.length > 0) {
    section.calc(
      `Facteurs identiques parce qu’ils s’appliquent à toute la zone (ils n’expliquent pas l’écart) : ${diff.sharedUniform.map((l) => cleanText(l, 80)).join(', ')}.`,
      refs,
    )
  }
  if (diff.coverageDiffers.length > 0) {
    section.calc(
      `Groupes dont une seule des deux analyses a la donnée : ${diff.coverageDiffers.map((id) => ANALYZER_LABEL[id]).join(', ')}. Un écart peut venir de ce manque plutôt que du terrain.`,
      refs,
    )
  }
}

/**
 * « Expliquer une cellule ou une analyse » : texte structuré, produit par
 * des règles (aucun modèle), à partir d'un `CombinedAnalysis` DÉJÀ calculé.
 * Il ne recalcule aucun score : il relit facteurs, poids, sources, heures,
 * limites et données manquantes. Avec `other`, il ajoute pourquoi les deux
 * analyses diffèrent (via `diffAnalyses`, le calcul existant).
 */
export function explainAnalysis(input: ExplainInput): AssistantResult {
  const now = input.now ?? new Date()
  const builder = new ResultBuilder('explain', 'Explication d’une analyse', now)
  builder.source(
    'Analyse déjà calculée par l’application (carte de potentiel ou analyse d’un point)',
  )

  addSubject(builder, input.subject, 'Analyse')
  explainOne(builder, input.subject)
  if (input.other) {
    addSubject(builder, input.other, 'Analyse comparée')
    explainOne(builder, input.other)
    explainDifference(builder, input.subject, input.other)
  }
  return builder.build()
}
