import type { BrowserContext, Route } from '@playwright/test'
import { solidPng, type Rgb } from './png'

/**
 * SIMULATED map backend for E2E tests — never a substitute for the real
 * MapTiler / Esri services. It answers the exact URLs the app requests
 * (style JSON, raster tiles, sprite, glyphs) with small local fixtures so
 * layout, caching and offline behaviour can be tested deterministically
 * and without any API key or network. Anything that proves a *real*
 * provider works (valid keys, real tile coverage) belongs in a separate,
 * clearly named smoke test against the live service.
 */

export type MockCategory = 'style' | 'tile' | 'sprite' | 'glyph'

/** Colour of every tile of each mocked base layer. Distinct per layer so
 * a test can tell, from the pixels on screen, WHICH base layer rendered. */
const FALLBACK_TILE_COLOR: Rgb = [200, 160, 40]
export const TILE_COLOR: Readonly<Record<string, Rgb>> = {
  outdoor: [34, 139, 34],
  satellite: [20, 40, 120],
  'esri-imagery': [120, 40, 120],
}

export interface MockMapBackend {
  /** While `false`, every mocked provider host is refused as if the
   * network were down (the request never reaches a fixture). */
  setOnline(online: boolean): void
  /** Requests answered by a fixture, per category, since the last reset. */
  served(): Record<MockCategory, number>
  /** Requests refused because `setOnline(false)` was active. */
  refused(): number
  /** Makes the style of one layer kind (e.g. 'esri-imagery') answer HTTP
   * 403, as an invalid key would. `null` restores normal answers. */
  failStyle(kind: string | null): void
  /** Style kinds requested (in order) since the last reset. */
  styleRequests(): string[]
  /** Requests to hosts the app was not expected to call. */
  unexpectedHosts(): string[]
  reset(): void
}

const STYLE_HOST_MAPTILER = 'api.maptiler.com'
const STYLE_HOST_ESRI = 'basemapstyles-api.arcgis.com'
const TILE_HOST = 'tiles.e2e.test'
const SPRITE_HOST = 'sprites.e2e.test'
const GLYPH_HOST = 'glyphs.e2e.test'
const MOCKED_HOSTS = new Set([
  STYLE_HOST_MAPTILER,
  STYLE_HOST_ESRI,
  TILE_HOST,
  SPRITE_HOST,
  GLYPH_HOST,
])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

function styleKind(url: URL): string {
  if (url.hostname === STYLE_HOST_MAPTILER) {
    return /\/maps\/([^/]+)\/style\.json/.exec(url.pathname)?.[1] ?? 'outdoor'
  }
  // /arcgis/rest/services/styles/v2/styles/arcgis/<name>
  const name = /\/styles\/arcgis\/(.+)$/.exec(url.pathname)?.[1] ?? 'imagery'
  return `esri-${name.replace(/\/.*/, '')}`
}

function mockStyle(kind: string) {
  return {
    version: 8,
    name: `e2e-${kind}`,
    sources: {
      base: {
        type: 'raster',
        tiles: [`https://${TILE_HOST}/${kind}/{z}/{x}/{y}.png`],
        tileSize: 256,
        maxzoom: 18,
      },
      marker: {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-71.2, 46.8] },
        },
      },
    },
    sprite: `https://${SPRITE_HOST}/${kind}/sprite`,
    glyphs: `https://${GLYPH_HOST}/{fontstack}/{range}.pbf`,
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#222222' } },
      { id: 'base', type: 'raster', source: 'base' },
      {
        id: 'marker',
        type: 'symbol',
        source: 'marker',
        layout: {
          'icon-image': 'dot',
          'text-field': 'E2E',
          'text-font': ['Mock Regular'],
        },
      },
    ],
  }
}

export async function installMockMapBackend(
  context: BrowserContext,
): Promise<MockMapBackend> {
  let online = true
  let failingStyle: string | null = null
  let counts: Record<MockCategory, number> = { style: 0, tile: 0, sprite: 0, glyph: 0 }
  let refusedCount = 0
  let styles: string[] = []
  let unexpected: string[] = []

  function colorFor(kind: string): Rgb {
    return TILE_COLOR[kind] ?? FALLBACK_TILE_COLOR
  }

  async function handle(route: Route) {
    const url = new URL(route.request().url())
    if (
      LOCAL_HOSTS.has(url.hostname) ||
      url.protocol === 'data:' ||
      url.protocol === 'blob:'
    ) {
      await route.fallback()
      return
    }
    if (!MOCKED_HOSTS.has(url.hostname)) {
      unexpected.push(url.hostname)
      await route.abort('blockedbyclient')
      return
    }
    if (!online) {
      refusedCount++
      await route.abort('internetdisconnected')
      return
    }
    const cors = { 'access-control-allow-origin': '*' }
    switch (url.hostname) {
      case STYLE_HOST_MAPTILER:
      case STYLE_HOST_ESRI: {
        const kind = styleKind(url)
        styles.push(kind)
        if (failingStyle === kind) {
          await route.fulfill({ status: 403, headers: cors, body: 'forbidden' })
          return
        }
        counts.style++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify(mockStyle(kind)),
        })
        return
      }
      case TILE_HOST: {
        counts.tile++
        const kind = url.pathname.split('/')[1] ?? 'default'
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          headers: cors,
          body: solidPng(256, 256, colorFor(kind)),
        })
        return
      }
      case SPRITE_HOST: {
        counts.sprite++
        if (url.pathname.endsWith('.json')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: cors,
            body: JSON.stringify({
              dot: { width: 8, height: 8, x: 0, y: 0, pixelRatio: 1 },
            }),
          })
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'image/png',
            headers: cors,
            body: solidPng(8, 8, [255, 255, 255]),
          })
        }
        return
      }
      default: {
        // Glyph range: an empty (zero-glyph) but valid protobuf message.
        counts.glyph++
        await route.fulfill({
          status: 200,
          contentType: 'application/x-protobuf',
          headers: cors,
          body: Buffer.alloc(0),
        })
      }
    }
  }

  await context.route(/.*/, handle)

  return {
    setOnline(value) {
      online = value
    },
    failStyle(kind) {
      failingStyle = kind
    },
    served: () => ({ ...counts }),
    refused: () => refusedCount,
    styleRequests: () => [...styles],
    unexpectedHosts: () => [...unexpected],
    reset() {
      counts = { style: 0, tile: 0, sprite: 0, glyph: 0 }
      refusedCount = 0
      styles = []
      unexpected = []
    },
  }
}
