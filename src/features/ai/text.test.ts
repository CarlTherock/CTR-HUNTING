import { describe, expect, it, vi } from 'vitest'
import { abortError, isAbortError, mapInChunks } from './chunking'
import { cleanText, foldForSearch, noteExcerpt, plural, quoteData } from './text'
import { circularMeanDegrees, dayBounds } from './records'

describe('cleanText — les textes de l’utilisateur restent des données inertes', () => {
  it('retire les contrôles et les marques de direction, réduit les blancs', () => {
    const raw = `a${String.fromCharCode(0)}b${String.fromCharCode(0x202e)}c\n\n  d\te`
    expect(cleanText(raw, 50)).toBe('a b c d e')
  })

  it('tronque avec « … » sans couper une paire de substitution', () => {
    expect(cleanText('abcdefghij', 5)).toBe('abcde…')
    const emoji = '😀'.repeat(10)
    const cut = cleanText(emoji, 3)
    expect(cut).toBe('😀😀😀…')
  })

  it('garde le HTML comme du texte (c’est le rendu qui échappe, jamais ce code)', () => {
    expect(cleanText('<b>x</b>', 20)).toBe('<b>x</b>')
  })

  it('quoteData met entre guillemets ou signale l’absence de texte', () => {
    expect(quoteData('Poste')).toBe('« Poste »')
    expect(quoteData('   ')).toBe('« (sans texte) »')
    expect(noteExcerpt('  ')).toBeUndefined()
    expect(noteExcerpt('x'.repeat(500))?.length).toBe(121)
  })

  it('foldForSearch ignore accents et casse; plural accorde', () => {
    expect(foldForSearch('Écureuil Évadé')).toBe('ecureuil evade')
    expect(plural(1, 'trace')).toBe('1 trace')
    expect(plural(2, 'trace')).toBe('2 traces')
    expect(plural(2, 'point de repère', 'points de repère')).toBe('2 points de repère')
  })
})

describe('dates et statistiques', () => {
  it('dayBounds accepte un jour réel et refuse une date impossible', () => {
    expect(dayBounds('2026-10-07')).not.toBeNull()
    expect(dayBounds('2026-02-31')).toBeNull()
    expect(dayBounds('2026-13-01')).toBeNull()
    expect(dayBounds('hier')).toBeNull()
    const bounds = dayBounds('2026-10-07')
    expect(bounds && bounds.end - bounds.start).toBeGreaterThan(86_000_000)
  })

  it('moyenne circulaire : 350° et 10° donnent le nord, pas le sud', () => {
    const mean = circularMeanDegrees([350, 10])
    expect(mean?.mean ?? 99).toBeCloseTo(0, 5)
    expect(mean?.concentration).toBeGreaterThan(0.98)
    const spread = circularMeanDegrees([0, 90, 180, 270])
    expect(spread?.concentration).toBeLessThan(0.01)
    expect(circularMeanDegrees([])).toBeNull()
  })
})

describe('mapInChunks — découpage et annulation', () => {
  it('conserve l’ordre, omet les résultats undefined et rend la main par tranches', async () => {
    let clock = 0
    const yieldFn = vi.fn(() => Promise.resolve())
    const out = await mapInChunks(
      Array.from({ length: 100 }, (_, i) => i),
      (n) => (n % 2 === 0 ? n : undefined),
      { now: () => (clock += 1), yieldFn, budgetMs: 8 },
    )
    expect(out).toEqual(Array.from({ length: 50 }, (_, i) => i * 2))
    expect(yieldFn).toHaveBeenCalled()
  })

  it('rejette avec une AbortError si le signal est déjà annulé', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      mapInChunks([1, 2, 3], (n) => n, { signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => isAbortError(error))
    expect(isAbortError(abortError())).toBe(true)
    expect(isAbortError(new Error('autre'))).toBe(false)
  })

  it('n’exécute plus rien après l’annulation en cours de route', async () => {
    const controller = new AbortController()
    const seen: number[] = []
    let clock = 0
    const promise = mapInChunks(
      Array.from({ length: 1000 }, (_, i) => i),
      (n) => {
        seen.push(n)
        return n
      },
      {
        signal: controller.signal,
        now: () => (clock += 5),
        yieldFn: async () => {
          controller.abort()
        },
      },
    )
    await expect(promise).rejects.toSatisfy((error: unknown) => isAbortError(error))
    expect(seen.length).toBeLessThan(10)
  })
})
