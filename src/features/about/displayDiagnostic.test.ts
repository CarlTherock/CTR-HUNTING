import { afterEach, describe, expect, it } from 'vitest'
import {
  collectDisplayDiagnostic,
  formatBuildMoment,
  formatDisplayDiagnostic,
  lastMapDisplay,
  recordMapDisplay,
  resetMapDisplayForTests,
  utcOffsetLabel,
} from './displayDiagnostic'

afterEach(() => resetMapDisplayForTests())

describe('formatBuildMoment', () => {
  it('shows the full date, the time and the zone — never a bare date', () => {
    const m = formatBuildMoment('2026-10-10T00:56:47.000Z')
    expect(m.local).toMatch(/\d{2} h \d{2} min \d{2} s/)
    expect(m.zone.length).toBeGreaterThan(0)
    expect(m.offset).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
  })

  it('says « inconnue » for an unreadable build date', () => {
    expect(formatBuildMoment('pas une date').local).toBe('inconnue')
  })
})

describe('utcOffsetLabel', () => {
  it('formats the viewer offset with sign and minutes', () => {
    expect(utcOffsetLabel(new Date('2026-10-10T00:00:00Z'))).toMatch(
      /^UTC[+-]\d{2}:\d{2}$/,
    )
  })
})

describe('collectDisplayDiagnostic / formatDisplayDiagnostic', () => {
  it('collects only display facts and prints them as French plain text', () => {
    document.body.innerHTML =
      '<div id="root"><div><main></main><nav aria-label="Navigation principale"></nav></div></div>'
    const d = collectDisplayDiagnostic(window)
    expect(d.innerHeight).toBe(window.innerHeight)
    expect(d.displayMode).toMatch(/navigateur|standalone/)
    expect(d.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(d.rects.navigation).not.toBeNull()
    const text = formatDisplayDiagnostic(d)
    expect(text).toContain('Diagnostic d’affichage')
    expect(text).toContain('Zones sûres')
    expect(text).toContain('Navigation :')
    expect(text).toContain('Carte : pas encore ouverte')
    // No personal data leaks into the report.
    expect(text).not.toMatch(/\b(lat|lng|latitude|longitude|token|apikey)\b|key=/i)
  })

  it('reports the last map box once the map page has recorded it', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    recordMapDisplay(container, null, true, 1_000)
    expect(lastMapDisplay()?.immersive).toBe(true)
    const text = formatDisplayDiagnostic(collectDisplayDiagnostic(window), 4_000)
    expect(text).toContain('il y a 3 s')
    expect(text).toContain('immersif : oui')
  })
})
