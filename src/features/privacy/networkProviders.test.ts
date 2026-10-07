import { describe, expect, it } from 'vitest'
import { PROVIDER_HOSTS } from '../../../build/csp'
import packageJson from '../../../package.json'
import indexHtml from '../../../index.html?raw'
import { NETWORK_PROVIDERS, displayHost } from './networkProviders'

/**
 * The privacy page is only honest if it cannot fall behind the code. Two
 * independent sources of truth are compared with it:
 *  - the Content-Security-Policy allow-list (`build/csp.ts`), which is what the
 *    browser enforces: a host the app may contact must be on the page;
 *  - the URLs written in `src/services/**`, where the network calls live: a
 *    host used there must be allowed by the CSP, hence on the page.
 */
/** Production sources as raw text, keyed by their path under `src/`. */
function sources(files: Record<string, string>): [string, string][] {
  return Object.entries(files).map(([path, code]) => [
    path.replace(/^(\.\.\/)+/, 'src/'),
    code,
  ])
}

const SERVICE_SOURCES = sources(
  import.meta.glob<string>(['../../services/**/*.ts', '!**/*.test.ts', '!**/*.d.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)
const ALL_SOURCES = sources(
  import.meta.glob<string>(
    ['../../**/*.{ts,tsx}', '!**/*.test.{ts,tsx}', '!**/*.d.ts', '!../../test/**'],
    {
      query: '?raw',
      import: 'default',
      eager: true,
    },
  ),
)

/** Source text without comments, so that « see https://… » notes do not count. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Does a CSP entry (maybe `https://*.example.com`) cover `host`? */
function cspCovers(entry: string, host: string): boolean {
  const pattern = displayHost(entry)
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1))
  return host === pattern
}

/** Strings that look like hosts but are never contacted by the app: links
 * shown to the user and opened by them, and XML/SVG namespace identifiers. */
const LINK_ONLY_HOSTS = new Set([
  'www.w3.org',
  'www.quebec.ca',
  'www.donneesquebec.ca',
  'ouvert.canada.ca',
])

describe('privacy page provider list', () => {
  it('mentions every host the Content-Security-Policy allows', () => {
    const declared = NETWORK_PROVIDERS.flatMap((p) => p.hosts)
    for (const host of PROVIDER_HOSTS) {
      expect(declared, `hôte absent de la page de confidentialité : ${host}`).toContain(
        host,
      )
    }
  })

  it('lists no host that the Content-Security-Policy would block', () => {
    for (const host of NETWORK_PROVIDERS.flatMap((p) => p.hosts)) {
      expect(PROVIDER_HOSTS, `hôte inconnu de la CSP : ${host}`).toContain(host)
    }
  })

  it('gives each provider a purpose, what is sent, when, and a credit', () => {
    for (const provider of NETWORK_PROVIDERS) {
      expect(provider.purpose.length, provider.id).toBeGreaterThan(10)
      expect(provider.sent.length, provider.id).toBeGreaterThan(10)
      expect(provider.when.length, provider.id).toBeGreaterThan(10)
      expect(provider.credit.length, provider.id).toBeGreaterThan(10)
    }
    expect(new Set(NETWORK_PROVIDERS.map((p) => p.id)).size).toBe(
      NETWORK_PROVIDERS.length,
    )
  })

  it('covers every host written in the network code (src/services)', () => {
    const found = new Map<string, string>()
    for (const [file, source] of SERVICE_SOURCES) {
      const code = stripComments(source)
      for (const match of code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        found.set(match[1].toLowerCase(), file)
      }
    }
    expect(found.size).toBeGreaterThan(5)

    for (const [host, file] of found) {
      if (LINK_ONLY_HOSTS.has(host)) continue
      const covered = PROVIDER_HOSTS.some((entry) => cspCovers(entry, host))
      expect(covered, `${host} (${file}) n'est pas dans la CSP ni sur la page`).toBe(true)
    }
  })
})

describe('no analytics or tracking', () => {
  const TRACKER_PATTERN =
    /sendBeacon|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|document\.cookie|gtag\(|google-analytics|googletagmanager|plausible|posthog|mixpanel|sentry|matomo|hotjar|amplitude|segment\.(com|io)/i

  it('has no analytics dependency', () => {
    const pkg = packageJson as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(names.filter((name) => TRACKER_PATTERN.test(name))).toEqual([])
  })

  it('has no tracking call, cookie or beacon in the application code', () => {
    expect(ALL_SOURCES.length).toBeGreaterThan(100)
    const offenders = ALL_SOURCES.filter(([, code]) =>
      TRACKER_PATTERN.test(stripComments(code)),
    ).map(([file]) => file)
    expect(offenders).toEqual([])
  })

  it('loads no third-party script or font from the HTML entry point', () => {
    const html = indexHtml
    expect(html).not.toMatch(/<script[^>]+src="https?:/i)
    expect(html).not.toMatch(/<link[^>]+href="https?:/i)
  })
})
