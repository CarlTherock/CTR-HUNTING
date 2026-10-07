import { describe, expect, it } from 'vitest'
import { buildCsp } from '../../build/csp'

describe('buildCsp', () => {
  const csp = buildCsp()
  const directive = (name: string) =>
    csp
      .split('; ')
      .find((d) => d.startsWith(`${name} `))
      ?.slice(name.length + 1)

  it('forbids inline and eval scripts', () => {
    expect(directive('script-src')).toBe("'self'")
    expect(csp).not.toContain('unsafe-eval')
  })

  it('does not allow every https origin', () => {
    expect(csp).not.toMatch(/(^|\s)https:(\s|;|$)/)
    expect(directive('connect-src')).toContain('https://api.maptiler.com')
  })

  it('lets MapLibre start its worker from blob: and the app origin only', () => {
    expect(directive('worker-src')).toBe("'self' blob:")
  })

  it('blocks plugins and base-tag injection', () => {
    expect(directive('object-src')).toBe("'none'")
    expect(directive('base-uri')).toBe("'self'")
  })

  it('allows exactly the Québec government hosts used by the forest/LiDAR/territory layers', () => {
    for (const host of [
      'https://geoegl.msp.gouv.qc.ca',
      'https://geo.environnement.gouv.qc.ca',
      'https://servicescarto.mrnf.gouv.qc.ca',
    ]) {
      expect(directive('img-src')).toContain(host)
      expect(directive('connect-src')).toContain(host)
    }
    expect(directive('img-src')).not.toContain('*.gouv.qc.ca')
  })

  it('adds extra hosts (E2E simulated backend) only when asked', () => {
    expect(csp).not.toContain('e2e.test')
    expect(buildCsp(['https://tiles.e2e.test'])).toContain('https://tiles.e2e.test')
  })
})
