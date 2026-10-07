import {
  CONSULTED_CAP,
  DETERMINISTIC_ORIGIN_LABEL,
  REFS_PER_STATEMENT_CAP,
} from './types'
import type {
  AssistantContext,
  AssistantResult,
  AssistantSection,
  AssistantToolId,
  ContextFactor,
  DeterministicNature,
  EntityRef,
  Statement,
} from './types'

const refKey = (ref: EntityRef) => `${ref.kind}:${ref.id}`

/** Gestionnaire d'une section en cours de construction. */
export class SectionBuilder {
  private readonly section: AssistantSection
  private readonly owner: ResultBuilder
  constructor(heading: string, owner: ResultBuilder) {
    this.owner = owner
    this.section = { heading, statements: [] }
    owner.register(this.section)
  }

  /**
   * Ajoute un énoncé. Chaque énoncé a OBLIGATOIREMENT une nature (le type
   * n'accepte pas « interprétation IA »). Les liens au-delà du plafond ne
   * sont pas listés, mais restent comptés dans le contexte et signalés.
   */
  add(text: string, nature: DeterministicNature, refs: EntityRef[] = []): this {
    const kept = refs.slice(0, REFS_PER_STATEMENT_CAP)
    const hidden = refs.length - kept.length
    const statement: Statement = {
      id: this.owner.nextStatementId(),
      text: hidden > 0 ? `${text} (${hidden} autre(s) non listé(s) ici)` : text,
      nature,
      refs: kept,
    }
    this.section.statements.push(statement)
    for (const ref of refs) this.owner.consult(ref)
    return this
  }

  fact(text: string, refs: EntityRef[] = []): this {
    return this.add(text, 'fait enregistré', refs)
  }

  calc(text: string, refs: EntityRef[] = []): this {
    return this.add(text, 'calcul', refs)
  }

  estimate(text: string, refs: EntityRef[] = []): this {
    return this.add(text, 'estimation', refs)
  }

  get size(): number {
    return this.section.statements.length
  }
}

/**
 * Construit un `AssistantResult` : sections, énoncés étiquetés et contexte
 * structuré (données utilisées, dates, sources, facteurs, manques, éléments
 * consultés). Un seul chemin de construction pour les cinq outils, afin que
 * la traçabilité soit identique partout.
 */
export class ResultBuilder {
  private readonly sections: AssistantSection[] = []
  private statementCount = 0
  private readonly dataUsed: string[] = []
  private readonly dates: { label: string; value: string }[] = []
  private readonly sources = new Set<string>()
  private readonly factors: ContextFactor[] = []
  private readonly missing: string[] = []
  private readonly consultedRefs = new Map<string, EntityRef>()

  private readonly tool: AssistantToolId
  private readonly title: string
  private readonly now: Date

  constructor(tool: AssistantToolId, title: string, now: Date) {
    this.tool = tool
    this.title = title
    this.now = now
  }

  /** @internal */
  register(section: AssistantSection): void {
    this.sections.push(section)
  }

  /** @internal */
  nextStatementId(): string {
    this.statementCount += 1
    return `s${this.statementCount}`
  }

  /** @internal */
  consult(ref: EntityRef): void {
    this.consultedRefs.set(refKey(ref), ref)
  }

  section(heading: string): SectionBuilder {
    return new SectionBuilder(heading, this)
  }

  used(text: string): this {
    this.dataUsed.push(text)
    return this
  }

  date(label: string, value: string): this {
    this.dates.push({ label, value })
    return this
  }

  source(text: string): this {
    this.sources.add(text)
    return this
  }

  factor(factor: ContextFactor): this {
    this.factors.push(factor)
    if (factor.source) this.sources.add(factor.source)
    return this
  }

  missingData(text: string): this {
    if (!this.missing.includes(text)) this.missing.push(text)
    return this
  }

  build(): AssistantResult {
    const all = [...this.consultedRefs.values()]
    const context: AssistantContext = {
      tool: this.tool,
      generatedAt: this.now.toISOString(),
      dataUsed: this.dataUsed,
      dates: this.dates,
      sources: [...this.sources],
      factors: this.factors,
      missingData: this.missing,
      consulted: all.slice(0, CONSULTED_CAP),
      consultedTotal: all.length,
    }
    return {
      tool: this.tool,
      title: this.title,
      origin: 'deterministic',
      originLabel: DETERMINISTIC_ORIGIN_LABEL,
      // Une section sans énoncé n'est pas affichée.
      sections: this.sections.filter((s) => s.statements.length > 0),
      context,
    }
  }
}
