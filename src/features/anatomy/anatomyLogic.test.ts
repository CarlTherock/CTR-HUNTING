import { describe, expect, it } from 'vitest'
import {
  buildImpact,
  clientToNormalized,
  impactMatchesShot,
  impactVersionStatus,
  initialZoom,
  normalizeZoom,
  panBy,
  regionAnchor,
  regionAt,
  visibleBox,
  withImpact,
  withoutImpact,
  zoomBy,
} from './anatomyLogic'
import { ILLUSTRATIONS } from './illustrations'

const deer = ILLUSTRATIONS.deer
const moose = ILLUSTRATIONS.moose

describe('illustrations', () => {
  it('deer and moose are separate drawings, not scaled copies', () => {
    expect(deer.silhouette).not.toEqual(moose.silhouette)
    expect(deer.version).not.toBe(moose.version)
    expect(deer.width / deer.height).not.toBeCloseTo(moose.width / moose.height, 2)
    const deerRegionPoints = deer.regions.map((r) => r.polygon.length)
    expect(deerRegionPoints.length).toBe(moose.regions.length)
    expect(deer.regions[0]?.polygon).not.toEqual(moose.regions[0]?.polygon)
  })

  it.each([deer, moose])(
    'every asset states origin, licence, references and limits',
    (ill) => {
      expect(ill.provenance.origin).not.toBe('')
      expect(ill.provenance.licence).not.toBe('')
      expect(ill.provenance.anatomicalReferences.length).toBeGreaterThan(0)
      expect(ill.provenance.validationLimits).not.toBe('')
    },
  )

  it.each([deer, moose])('every region anchor falls inside its own region', (ill) => {
    for (const region of ill.regions) {
      const found = regionAt(ill, regionAnchor(ill, region))
      expect(found?.id).toBe(region.id)
    }
  })

  it.each([deer, moose])('drawn structures only reference known structures', (ill) => {
    const ids = new Set(ill.structures.map((s) => s.id))
    for (const region of ill.regions) {
      for (const drawn of region.drawn) expect(ids.has(drawn)).toBe(true)
    }
  })
})

describe('regionAt', () => {
  it('finds the chest region and returns null outside every region', () => {
    expect(regionAt(deer, { x: 208 / 400, y: 128 / 260 })?.id).toBe('thorax')
    expect(regionAt(deer, { x: 0.01, y: 0.99 })).toBeNull()
  })
})

describe('zoom and coordinates', () => {
  const rect = { left: 10, top: 20, width: 800, height: 520 }

  it('maps a click to the same normalized point at zoom 1', () => {
    const box = visibleBox(deer, initialZoom(deer))
    // The element has the drawing's 400:260 ratio, so there is no margin.
    const point = clientToNormalized(rect, box, deer, { x: 10 + 400, y: 20 + 260 })
    expect(point.x).toBeCloseTo(0.5, 5)
    expect(point.y).toBeCloseTo(0.5, 5)
  })

  it('keeps the same drawing point under the finger after zoom about an anchor', () => {
    const anchor = { x: 250, y: 120 }
    const zoomed = zoomBy(deer, initialZoom(deer), 2, anchor)
    const box = visibleBox(deer, zoomed)
    expect(zoomed.scale).toBe(2)
    const sx = (anchor.x - box.x) / box.w
    const sy = (anchor.y - box.y) / box.h
    expect(sx).toBeCloseTo(250 / 400, 5)
    expect(sy).toBeCloseTo(120 / 260, 5)
    const clicked = clientToNormalized(rect, box, deer, {
      x: rect.left + sx * rect.width,
      y: rect.top + sy * rect.height,
    })
    expect(clicked.x).toBeCloseTo(250 / 400, 5)
    expect(clicked.y).toBeCloseTo(120 / 260, 5)
  })

  it('stays correct after the element is resized (rotation)', () => {
    const zoomed = zoomBy(deer, initialZoom(deer), 2.5, { x: 300, y: 130 })
    const box = visibleBox(deer, zoomed)
    const portrait = { left: 0, top: 0, width: 350, height: 300 }
    const landscape = { left: 0, top: 0, width: 520, height: 180 }
    for (const r of [portrait, landscape]) {
      const target = { x: 300, y: 130 }
      const m = Math.min(r.width / box.w, r.height / box.h)
      const offX = (r.width - box.w * m) / 2
      const offY = (r.height - box.h * m) / 2
      const client = {
        x: r.left + offX + (target.x - box.x) * m,
        y: r.top + offY + (target.y - box.y) * m,
      }
      const back = clientToNormalized(r, box, deer, client)
      expect(back.x).toBeCloseTo(300 / 400, 5)
      expect(back.y).toBeCloseTo(130 / 260, 5)
    }
  })

  it('limits the scale and keeps the visible box inside the drawing', () => {
    expect(zoomBy(deer, initialZoom(deer), 100).scale).toBe(4)
    expect(zoomBy(deer, initialZoom(deer), 0.01).scale).toBe(1)
    const panned = panBy(deer, zoomBy(deer, initialZoom(deer), 2), -9999, 9999)
    const box = visibleBox(deer, panned)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y + box.h).toBeLessThanOrEqual(deer.height + 1e-9)
    expect(normalizeZoom(deer, { scale: 1, cx: -50, cy: 900 })).toEqual(initialZoom(deer))
  })

  it('clamps points picked outside the drawing', () => {
    const box = visibleBox(deer, initialZoom(deer))
    const p = clientToNormalized(rect, box, deer, { x: -500, y: 9000 })
    expect(p).toEqual({ x: 0, y: 1 })
  })
})

describe('impact record', () => {
  const NOW = '2026-10-08T12:00:00.000Z'

  it('keeps species, view, normalized coordinates, region, presumption, date and version', () => {
    const impact = buildImpact(deer, { x: 0.52, y: 0.49 }, '  près de l’épaule  ', NOW)
    expect(impact).toEqual({
      species: 'deer',
      view: 'lateral-left',
      x: 0.52,
      y: 0.49,
      regionId: 'thorax',
      presumed: true,
      recordedAt: NOW,
      illustrationVersion: deer.version,
      note: 'près de l’épaule',
    })
  })

  it('omits region and note when there are none', () => {
    const impact = buildImpact(deer, { x: 0.01, y: 0.99 }, '', NOW)
    expect(impact).not.toHaveProperty('regionId')
    expect(impact).not.toHaveProperty('note')
  })

  it('adds and removes an impact without touching other shot fields', () => {
    const shot = { species: 'deer' as const, reaction: 'a bondi', searchSessionId: 's1' }
    const impact = buildImpact(deer, { x: 0.5, y: 0.5 }, '', NOW)
    const saved = withImpact(shot, impact)
    expect(saved).toMatchObject(shot)
    expect(saved.impact).toBe(impact)
    expect(withoutImpact(saved)).toEqual(shot)
  })

  it('refuses a drawing of the wrong species and flags an older drawing version', () => {
    expect(impactMatchesShot({ species: 'deer' }, moose)).toBe(false)
    expect(impactMatchesShot({ species: 'moose' }, moose)).toBe(true)
    const impact = buildImpact(deer, { x: 0.5, y: 0.5 }, '', NOW)
    expect(impactVersionStatus(impact, deer)).toBe('current')
    expect(
      impactVersionStatus(
        { ...impact, illustrationVersion: 'cerf-profil-gauche-0' },
        deer,
      ),
    ).toBe('older')
  })
})
