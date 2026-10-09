import type { BrowserContext, Page } from '@playwright/test'
import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
} from './support/layout'
import { countPixelsNear } from './support/pixels'
import { stubGps } from './support/browserStubs'
import { expectReachable } from './support/reachable'
import { VIEWPORTS } from './support/viewports'
import { createWaypointViaUi, readWaypoints } from './support/waypointData'
import type { StoredWaypoint } from './support/waypointData'
import { expect, test } from './support/test'

/**
 * "Aller à" — bird's-eye guidance to a saved waypoint.
 *
 * EVERYTHING sensor-related here is SIMULATED, in Chromium only:
 *  - the GPS position comes from Playwright's geolocation override (or a
 *    stubbed `watchPosition`);
 *  - the compass comes from synthetic `deviceorientationabsolute` events
 *    dispatched with `page.evaluate`.
 * This proves the app's logic and layout. It does NOT prove anything about a
 * physical compass, a real GPS receiver or iOS Safari (see docs/VALIDATION.md).
 */

const START = { latitude: 46.8, longitude: -71.2, accuracy: 5 }
const NEXT = { latitude: 46.8, longitude: -71.19, accuracy: 5 }

// ---- independent reference maths (not imported from the app) -------------

function rad(d: number) {
  return (d * Math.PI) / 180
}
function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
function bearingDegrees(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360
}
function signedDelta(from: number, to: number) {
  const d = (((to - from) % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}
function parseDistance(text: string): number {
  const match = /([\d.,]+)\s*(km|m)\b/.exec(text)
  if (!match) throw new Error(`no distance in "${text}"`)
  const value = Number((match[1] ?? '').replace(',', '.'))
  return match[2] === 'km' ? value * 1000 : value
}
const here = (g: { latitude: number; longitude: number }) => ({
  lat: g.latitude,
  lng: g.longitude,
})

// ---- page helpers --------------------------------------------------------

async function sendHeading(page: Page, magneticHeading: number) {
  // A flat phone: alpha = 360 - magnetic heading.
  const alpha = (360 - magneticHeading) % 360
  await page.evaluate((a) => {
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientationabsolute', {
        alpha: a,
        beta: 0,
        gamma: 0,
        absolute: true,
      }),
    )
  }, alpha)
}

async function sendRelativeOnly(page: Page, alpha: number) {
  await page.evaluate((a) => {
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientation', {
        alpha: a,
        beta: 0,
        gamma: 0,
        absolute: false,
      }),
    )
  }, alpha)
}

async function openMap(page: Page) {
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
}

/** Creates a waypoint at the map centre, then taps it and "Aller à". */
async function createAndGuide(
  page: Page,
  name = 'Mirador nord',
): Promise<StoredWaypoint> {
  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas')
  const waypoint = await createWaypointViaUi(page, name, {
    x: Math.round(box.width / 2) - 40,
    y: Math.round(box.height / 2) - 40,
  })
  await page.getByTestId('waypoint-marker').first().click()
  await page.getByRole('button', { name: 'Aller à', exact: true }).click()
  await expect(page.getByTestId('guidance-panel')).toBeVisible()
  return waypoint
}

/** Re-sends the simulated position so its timestamp is "now": Chromium only
 * delivers a position when it changes, and the app rightly calls a fix older
 * than 15 s "Ancien". */
async function freshFix(
  context: BrowserContext,
  position: { latitude: number; longitude: number; accuracy?: number },
) {
  await context.setGeolocation(position)
}

async function readTracks(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result
            .transaction('tracks', 'readonly')
            .objectStore('tracks')
            .getAll()
          all.onsuccess = () => resolve(all.result)
          all.onerror = () => reject(all.error)
        }
      }),
  )
}

async function distanceShown(page: Page): Promise<number> {
  return parseDistance(await page.getByTestId('guidance-distance').innerText())
}

const FUCHSIA = [217, 70, 239] as const

test.describe('Aller à — GPS simulé accordé', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: START,
    viewport: { width: 1280, height: 800 },
  })

  test.beforeEach(async ({ page, backend }) => {
    void backend
    await openMap(page)
  })

  test('distance, relèvement, ligne sur la carte, mise à jour, arrêt, sans suivi enregistré', async ({
    page,
    context,
  }) => {
    const waypoint = await createAndGuide(page)
    const before = JSON.stringify(await readWaypoints(page))

    // The sheet closed, the panel opened.
    await expect(page.getByRole('heading', { name: 'Point de repère' })).toBeHidden()
    await expect(page.getByTestId('guidance-title')).toHaveText('Aller à : Mirador nord')
    await expect(page.getByTestId('guidance-disclaimer')).toHaveText(
      'Guidage à vol d’oiseau — pas un itinéraire routier ou un sentier sécurisé.',
    )

    // Distance and true bearing match an independent computation.
    const w = waypoint.coordinate
    await expect
      .poll(
        async () =>
          Math.abs((await distanceShown(page)) - distanceMeters(here(START), w)),
        {
          timeout: 15_000,
        },
      )
      .toBeLessThan(Math.max(15, distanceMeters(here(START), w) * 0.01))
    const bearingText = await page.getByTestId('guidance-bearing').innerText()
    const shownBearing = Number(/^(\d+)°/.exec(bearingText)?.[1])
    expect(
      Math.abs(signedDelta(shownBearing, bearingDegrees(here(START), w))),
    ).toBeLessThanOrEqual(1)
    expect(bearingText).toContain('(nord vrai)')
    await freshFix(context, START)
    await expect(page.getByTestId('guidance-gps-state')).toContainText('Disponible')

    // The dashed line is drawn on the map canvas, in its own colour.
    const canvas = page.locator('canvas.maplibregl-canvas')
    await expect
      .poll(async () => countPixelsNear(page, canvas, FUCHSIA), { timeout: 10_000 })
      .toBeGreaterThan(15)

    // A new simulated position changes the distance.
    const first = await distanceShown(page)
    await context.setGeolocation(NEXT)
    await expect
      .poll(
        async () => Math.abs((await distanceShown(page)) - distanceMeters(here(NEXT), w)),
        {
          timeout: 15_000,
        },
      )
      .toBeLessThan(Math.max(15, distanceMeters(here(NEXT), w) * 0.01))
    expect(await distanceShown(page)).not.toBe(first)

    // Nothing was written: no track, waypoint untouched.
    expect(await readTracks(page)).toEqual([])
    expect(JSON.stringify(await readWaypoints(page))).toBe(before)

    // Stop: the panel and the line disappear; still nothing written.
    await page.getByRole('button', { name: 'Arrêter le guidage' }).click()
    await expect(page.getByTestId('guidance-panel')).toBeHidden()
    await expect
      .poll(async () => countPixelsNear(page, canvas, FUCHSIA), { timeout: 10_000 })
      .toBeLessThan(5)
    expect(await readTracks(page)).toEqual([])
    expect(JSON.stringify(await readWaypoints(page))).toBe(before)
  })

  test('cap du téléphone : pas de flèche sans boussole, flèche relative avec cap vrai, cône sur la carte', async ({
    page,
  }) => {
    const waypoint = await createAndGuide(page)
    const bearing = bearingDegrees(here(START), waypoint.coordinate)

    // No compass reading yet: bearing in degrees, no relative arrow.
    await expect(page.getByTestId('guidance-bearing')).toBeVisible()
    await expect(page.getByTestId('guidance-arrow')).toHaveCount(0)
    await expect(page.getByTestId('guidance-arrow-reason')).toContainText(
      'Cap du téléphone indisponible',
    )
    await expect(page.getByTestId('user-heading-cone')).toBeHidden()

    // A relative-only sensor never gives a north-relative heading.
    await sendRelativeOnly(page, 120)
    await expect(page.getByTestId('guidance-arrow')).toHaveCount(0)

    // Absolute heading: the arrow appears, relative to the TRUE heading.
    await sendHeading(page, 20)
    await expect(page.getByTestId('guidance-arrow')).toBeVisible()
    const compassText = await page.getByTestId('guidance-compass-text').innerText()
    const parsed =
      /Cap du téléphone : (\d+)° vrai \((\d+)° magnétique, déclinaison ([−+])(\d+),(\d)°\)/.exec(
        compassText,
      )
    expect(parsed, compassText).not.toBeNull()
    const trueHeading = Number(parsed?.[1])
    const magnetic = Number(parsed?.[2])
    const declination =
      (parsed?.[3] === '−' ? -1 : 1) * Number(`${parsed?.[4]}.${parsed?.[5]}`)
    expect(magnetic).toBe(20)
    // Québec: magnetic north is about 15 degrees WEST of true north.
    expect(declination).toBeLessThan(-13)
    expect(declination).toBeGreaterThan(-17)
    expect(
      Math.abs(signedDelta(magnetic + declination, trueHeading)),
    ).toBeLessThanOrEqual(1)

    const expected = signedDelta(trueHeading, bearing)
    const shown = Number(
      await page.getByTestId('guidance-arrow').getAttribute('data-angle'),
    )
    expect(Math.abs(signedDelta(shown, expected))).toBeLessThanOrEqual(2)

    // The cone on the "you are here" dot appears, rotated by the TRUE heading.
    await expect(page.getByTestId('user-heading-cone')).toBeVisible()
    await expect(page.getByTestId('user-location-marker')).toHaveAttribute(
      'data-heading',
      String(trueHeading),
    )

    // Turn the phone to face the target: "Droit devant".
    await page.waitForTimeout(150)
    await sendHeading(page, bearing - declination)
    await expect(page.getByTestId('guidance-relative')).toHaveText('Droit devant')
  })

  test('la flèche tourne par le chemin le plus court en traversant le nord', async ({
    page,
  }) => {
    const waypoint = await createAndGuide(page)
    const bearing = bearingDegrees(here(START), waypoint.coordinate)
    await sendHeading(page, 0)
    await expect(page.getByTestId('guidance-arrow')).toBeVisible()

    const rotations: number[] = []
    // Sweep the phone through a full turn in 40-degree steps.
    for (let heading = 0; heading <= 400; heading += 40) {
      await page.waitForTimeout(130)
      await sendHeading(page, heading % 360)
      await page.waitForTimeout(60)
      const transform = await page
        .getByTestId('guidance-arrow-rotor')
        .evaluate((el) => (el as unknown as SVGElement).style.transform)
      rotations.push(Number(/rotate\((-?[\d.]+)deg\)/.exec(transform)?.[1]))
    }
    for (let i = 1; i < rotations.length; i++) {
      const step = Math.abs((rotations[i] ?? 0) - (rotations[i - 1] ?? 0))
      // Each phone step is 40 degrees: never a near-360 spin the long way.
      expect(step, `étape ${i}: ${JSON.stringify(rotations)}`).toBeLessThanOrEqual(45)
    }
    expect(bearing).toBeGreaterThanOrEqual(0)
  })

  test('fonctionne hors ligne : le calcul est local', async ({ page, context }) => {
    const waypoint = await createAndGuide(page)
    await expect(page.getByTestId('guidance-distance')).toBeVisible()

    await context.setOffline(true)
    await context.setGeolocation(NEXT)

    const w = waypoint.coordinate
    await expect
      .poll(
        async () => Math.abs((await distanceShown(page)) - distanceMeters(here(NEXT), w)),
        {
          timeout: 15_000,
        },
      )
      .toBeLessThan(Math.max(15, distanceMeters(here(NEXT), w) * 0.01))
    // The declination model is a local chunk: the compass keeps its true heading offline.
    await sendHeading(page, 20)
    await expect(page.getByTestId('guidance-compass-text')).toContainText('vrai')
    await context.setOffline(false)
  })

  test('cohabite avec un suivi enregistré explicitement, sans le démarrer ni l’arrêter', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Outils' }).click()
    await page.getByRole('button', { name: 'Enregistrer une trace GPS' }).click()
    await expect(page.getByText('● Enregistrement')).toBeVisible()
    await expect.poll(async () => (await readTracks(page)).length).toBe(1)

    await createAndGuide(page)
    await expect(page.getByText('● Enregistrement')).toBeVisible()
    expect((await readTracks(page)).length).toBe(1)

    await page.getByRole('button', { name: 'Arrêter le guidage' }).click()
    await expect(page.getByText('● Enregistrement')).toBeVisible()

    // Stopping the recording does not touch guidance either.
    await page.getByTestId('waypoint-marker').first().click()
    await page.getByRole('button', { name: 'Aller à', exact: true }).click()
    await page.getByRole('button', { name: 'Arrêter et enregistrer la trace' }).click()
    await expect(page.getByText('● Enregistrement')).toBeHidden()
    await expect(page.getByTestId('guidance-panel')).toBeVisible()
    expect((await readTracks(page)).length).toBe(1)
  })

  test('GPS qui ne donne plus de mise à jour : « non fraîches » puis plus de distance (horloge simulée)', async ({
    page,
    context,
  }) => {
    await createAndGuide(page)
    await expect(page.getByTestId('guidance-distance')).toBeVisible()
    await freshFix(context, START)
    await expect(page.getByTestId('guidance-not-fresh')).toHaveCount(0)

    // Make the browser believe time passes while the receiver stays silent.
    await page.clock.install({ time: new Date() })
    await page.clock.fastForward(60_000)
    await expect(page.getByTestId('guidance-not-fresh')).toContainText('non fraîches')
    await expect(page.getByTestId('guidance-distance')).toBeVisible()

    await page.clock.fastForward(200_000)
    await expect(page.getByTestId('guidance-unavailable')).toContainText('trop ancien')
    await expect(page.getByTestId('guidance-distance')).toHaveCount(0)
    await expect(page.getByTestId('guidance-bearing')).toHaveCount(0)
  })

  test('« Suivre ma position » recentre sur chaque position récente, se met en pause au geste, reprend', async ({
    page,
    context,
  }) => {
    await createAndGuide(page)
    const marker = page.getByTestId('waypoint-marker').first()
    const x = async () => (await marker.boundingBox())?.x ?? 0

    await page.getByRole('button', { name: 'Suivre ma position' }).click()
    await expect(
      page.getByRole('button', { name: 'Suivre ma position' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Reprendre le suivi' })).toHaveCount(0)

    // Move the (simulated) device east: the map follows, so the waypoint slides west.
    const afterStart = await x()
    await context.setGeolocation({ ...START, longitude: -71.19 })
    await expect.poll(x, { timeout: 10_000 }).not.toBe(afterStart)

    // A manual drag pauses the follow and offers to resume.
    const canvas = page.locator('canvas.maplibregl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, {
      steps: 6,
    })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: 'Reprendre le suivi' })).toBeVisible()

    const paused = await x()
    await context.setGeolocation({ ...START, longitude: -71.18 })
    await page.waitForTimeout(1200)
    expect(Math.abs((await x()) - paused)).toBeLessThan(2)

    await page.getByRole('button', { name: 'Reprendre le suivi' }).click()
    await expect(page.getByRole('button', { name: 'Reprendre le suivi' })).toHaveCount(0)
    await expect.poll(x, { timeout: 10_000 }).not.toBe(paused)
  })
})

test.describe('Aller à — GPS refusé', () => {
  test.use({ permissions: [], viewport: { width: 1280, height: 800 } })

  test('la raison est affichée, aucune distance, le point reste consultable', async ({
    page,
    backend,
  }) => {
    void backend
    await openMap(page)
    await createAndGuide(page)

    await expect(page.getByTestId('guidance-unavailable')).toContainText(
      'Autorisation de localisation refusée',
    )
    await expect(page.getByTestId('guidance-distance')).toHaveCount(0)
    await expect(page.getByTestId('guidance-bearing')).toHaveCount(0)
    await expect(page.getByTestId('guidance-arrow')).toHaveCount(0)
    await expect(page.getByTestId('guidance-gps-state')).toContainText('Refusé')

    // Viewing (and sharing) the waypoint still works while guiding.
    await page.getByTestId('waypoint-marker').first().click()
    await expect(page.getByTestId('waypoint-position')).toBeVisible()
    await expect(page.getByTestId('waypoint-latitude')).toBeVisible()
    await expect(page.getByRole('button', { name: /Copier le texte/ })).toBeVisible()
  })
})

test.describe('Aller à — GPS ancien (récepteur simulé)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('un relevé de 20 s : chiffres affichés mais « non fraîches », avec l’âge', async ({
    page,
    backend,
  }) => {
    void backend
    await stubGps(page, {
      kind: 'fix',
      lat: 46.8,
      lng: -71.2,
      accuracy: 5,
      ageMs: 45_000,
    })
    await openMap(page)
    await createAndGuide(page)
    await expect(page.getByTestId('guidance-distance')).toBeVisible()
    await expect(page.getByTestId('guidance-not-fresh')).toContainText('non fraîches')
    await expect(page.getByTestId('guidance-not-fresh')).toContainText(
      /il y a \d+ (s|min)/,
    )
  })

  test('un relevé de 10 min : ni distance ni direction', async ({ page, backend }) => {
    void backend
    await stubGps(page, {
      kind: 'fix',
      lat: 46.8,
      lng: -71.2,
      accuracy: 5,
      ageMs: 600_000,
    })
    await openMap(page)
    await createAndGuide(page)
    await expect(page.getByTestId('guidance-unavailable')).toContainText('trop ancien')
    await expect(page.getByTestId('guidance-distance')).toHaveCount(0)
    await expect(page.getByTestId('guidance-bearing')).toHaveCount(0)
  })

  test('dans l’incertitude du GPS : message de proximité, ni flèche ni « arrivé »', async ({
    page,
    backend,
  }) => {
    void backend
    await stubGps(page, {
      kind: 'fix',
      lat: 46.8,
      lng: -71.2,
      accuracy: 100_000,
      ageMs: 0,
    })
    await openMap(page)
    await createAndGuide(page)
    await expect(page.getByTestId('guidance-proximity')).toContainText(
      'À proximité — la précision du GPS (±100000 m) ne permet pas d’être plus précis.',
    )
    await expect(page.getByTestId('guidance-arrow')).toHaveCount(0)
    await expect(page.getByTestId('guidance-bearing')).toHaveCount(0)
    expect(await page.getByTestId('guidance-panel').innerText()).not.toMatch(/arriv/i)
  })
})

// ---- layout, all viewports -------------------------------------------------

for (const viewport of VIEWPORTS) {
  test.describe(`Aller à — disposition ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.mobile,
      isMobile: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
      permissions: ['geolocation'],
      geolocation: START,
    })

    test.beforeEach(async ({ context, page, backend }) => {
      void backend
      // Worst case for the layout: the iOS "Activer la boussole" button exists.
      await page.addInitScript(() => {
        const ctor = window.DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>
        }
        ctor.requestPermission = () => Promise.resolve('denied')
      })
      if (viewport.mobile && viewport.width < 768) {
        await applySafeArea(
          context,
          page,
          viewport.width > viewport.height
            ? IPHONE_LANDSCAPE_SAFE_AREA
            : IPHONE_PORTRAIT_SAFE_AREA,
        )
      }
      await openMap(page)
      await context.setGeolocation(START)
    })

    async function expectLayoutOk(page: Page, label: string) {
      const panel = page.getByTestId('guidance-panel')
      await expect(panel).toBeVisible()
      // The dock follows the tool rail through a ResizeObserver: wait for it to settle.
      await expect
        .poll(
          async () => {
            const m = await measureLayout(page)
            return m.controls.filter((c) => !c.inViewport || !c.hit).length
          },
          { timeout: 8_000, message: `${label}: contrôles hors écran ou masqués` },
        )
        .toBe(0)
      const m = await measureLayout(page)

      expect(
        m.document.scrollWidth,
        `${label}: défilement horizontal`,
      ).toBeLessThanOrEqual(m.document.clientWidth)
      expect(
        m.document.scrollHeight,
        `${label}: défilement vertical`,
      ).toBeLessThanOrEqual(m.document.clientHeight)

      const problems = m.controls
        .filter((c) => !c.inViewport || !c.hit)
        .map(
          (c) =>
            `${c.label} ${JSON.stringify(c.rect)} dansViewport=${c.inViewport} touchable=${c.hit}`,
        )
      expect(problems, `${label}: contrôles hors écran ou masqués`).toEqual([])

      if (viewport.mobile) {
        const small = m.controls
          .filter(
            (c) =>
              c.minSide < 44 && !/maplibre|openstreetmap|maptiler|esri|©/i.test(c.label),
          )
          .map(
            (c) => `${c.label} ${Math.round(c.rect.width)}x${Math.round(c.rect.height)}`,
          )
        expect(small, `${label}: cibles tactiles < 44 px`).toEqual([])
      }

      // The panel stays inside the map and never covers it all.
      const box = await panel.boundingBox()
      const container = m.rects.mapContainer
      expect(box && container).toBeTruthy()
      if (box && container) {
        expect(box.x).toBeGreaterThanOrEqual(container.x - 0.5)
        expect(box.y).toBeGreaterThanOrEqual(container.y - 0.5)
        expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width + 0.5)
        expect(box.y + box.height).toBeLessThanOrEqual(
          container.y + container.height + 0.5,
        )
        expect(
          box.height,
          `${label}: le panneau couvre trop la carte`,
        ).toBeLessThanOrEqual(container.height * 0.76)
      }
      // The two always-visible buttons exist and are fully on screen.
      for (const name of ['Arrêter le guidage', /^(Réduire|Agrandir)$/]) {
        const b = await page.getByRole('button', { name }).boundingBox()
        expect(b, `${label}: bouton ${String(name)}`).not.toBeNull()
      }
    }

    test('panneau ouvert, réduit, puis rotation de l’écran', async ({ page }) => {
      await createAndGuide(
        page,
        'Mirador nord avec un nom particulièrement long pour tester',
      )
      // Short landscape: the panel starts folded (and expands on demand).
      if (viewport.width > viewport.height && viewport.height <= 480) {
        await expect(page.getByTestId('guidance-summary')).toBeVisible()
        await expectLayoutOk(page, 'replié au départ')
        await page.getByRole('button', { name: 'Agrandir' }).click()
      }
      await expect(page.getByTestId('guidance-distance')).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Activer la boussole' }),
      ).toBeVisible()
      await expectLayoutOk(page, 'ouvert')

      await page.getByRole('button', { name: 'Réduire' }).click()
      await expect(page.getByTestId('guidance-summary')).toBeVisible()
      await expectLayoutOk(page, 'réduit')
      await page.getByRole('button', { name: 'Agrandir' }).click()
      await expect(page.getByTestId('guidance-body')).toBeVisible()

      // Rotate the viewport (portrait <-> landscape) with the panel open.
      await page.setViewportSize({ width: viewport.height, height: viewport.width })
      await expect(page.getByTestId('guidance-panel')).toBeVisible()
      await expect
        .poll(async () => {
          const m = await measureLayout(page)
          return Math.abs(
            (m.rects.canvas?.height ?? 0) - (m.rects.mapContainer?.height ?? 1),
          )
        })
        .toBeLessThanOrEqual(2)
      if (viewport.width === 320) {
        // 568x320 (short landscape): the panel folds itself; its buttons
        // must be on screen and actually tappable (not covered).
        await expect(page.getByTestId('guidance-summary')).toBeVisible()
        const m = await measureLayout(page)
        expect(m.document.scrollWidth).toBeLessThanOrEqual(m.document.clientWidth)
        expect(m.document.scrollHeight).toBeLessThanOrEqual(m.document.clientHeight)
        for (const name of ['Arrêter le guidage', 'Agrandir']) {
          const button = page.getByRole('button', { name })
          await expect(button).toBeVisible()
          const b = await button.boundingBox()
          expect(b?.width ?? 0).toBeGreaterThanOrEqual(43.5)
          expect(b?.height ?? 0).toBeGreaterThanOrEqual(43.5)
          expect(
            await button.evaluate((el) => {
              const r = el.getBoundingClientRect()
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              return hit !== null && el.contains(hit)
            }),
            `${name} masqué`,
          ).toBe(true)
        }
        // Expanding keeps the buttons reachable (the body scrolls inside).
        await page.getByRole('button', { name: 'Agrandir' }).click()
        await expect(page.getByTestId('guidance-body')).toBeVisible()
        await expect(
          page.getByRole('button', { name: 'Arrêter le guidage' }),
        ).toBeVisible()
        const panelBox = await page.getByTestId('guidance-panel').boundingBox()
        expect(panelBox?.height ?? 999).toBeLessThanOrEqual(320 * 0.76)
      } else {
        await expectLayoutOk(page, 'après rotation')
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await expectLayoutOk(page, 'retour')
    })

    test('fiche du repère repliable : poignée + titre, jamais au-dessus de « Arrêter le guidage », état gardé à la rotation', async ({
      page,
    }) => {
      // Many steps (two rotations, fold/unfold): give it the extra time a slow
      // runner needs. Every assertion stays as is.
      test.slow()
      await createAndGuide(page, 'Mirador nord')
      // The waypoint is tapped on the map: when the open guidance panel hides
      // it (narrow screens), fold the guidance first, as a user would.
      const marker = page.getByTestId('waypoint-marker').first()
      const hidden = () =>
        marker.evaluate((el) => {
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return !hit || !el.contains(hit)
        })
      if (await hidden()) {
        await page.getByRole('button', { name: 'Réduire' }).click()
      }
      await expect.poll(hidden).toBe(false)
      await marker.click()
      const card = page.getByTestId('waypoint-edit-panel')
      await expect(card).toBeVisible()
      await expect(card).toHaveAttribute('data-folded', 'false')
      const fold = page.getByRole('button', { name: 'Replier la fiche' })
      await expect(fold).toHaveAttribute('aria-expanded', 'true')

      /** The card re-measures the dock one frame after a resize/rotation: poll
       * until the layout settles, then the final state must hold. */
      const settled = (check: () => Promise<void>) =>
        expect(check).toPass({ timeout: 8_000 })

      /** The card never sits over the guidance panel (nor over its stop button). */
      async function expectAboveGuidance(label: string) {
        const guidance = await page.getByTestId('guidance-panel').boundingBox()
        const box = await card.boundingBox()
        expect(guidance && box, `${label} : mesures`).toBeTruthy()
        if (!guidance || !box) return
        const overlapsHorizontally =
          box.x < guidance.x + guidance.width && guidance.x < box.x + box.width
        const overlapsVertically =
          box.y < guidance.y + guidance.height - 0.5 &&
          guidance.y < box.y + box.height - 0.5
        expect(
          overlapsHorizontally && overlapsVertically,
          `${label} : la fiche recouvre le panneau « Aller à »`,
        ).toBe(false)
      }

      // Open: the guidance stop button and the card's own controls are reachable.
      await settled(() =>
        expectReachable(page, [
          'Arrêter le guidage',
          'Replier la fiche',
          'Fermer sans enregistrer',
        ]),
      )
      await settled(() => expectAboveGuidance('ouverte'))

      // The form is kept (hidden, not destroyed) while folded.
      const name = page.getByLabel('Nom')
      await name.fill('Nom modifié')
      await page.getByRole('button', { name: 'Replier la fiche' }).click()
      await expect(card).toHaveAttribute('data-folded', 'true')
      const unfold = page.getByRole('button', { name: 'Déplier la fiche' })
      await expect(unfold).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByLabel('Nom')).toBeHidden()
      const folded = await card.boundingBox()
      expect(
        folded?.height ?? 999,
        'fiche repliée : poignée + titre seulement',
      ).toBeLessThan(96)
      // Folded: nothing of the map is covered (rail, guidance, + Repère).
      const mapControls = [
        'Arrêter le guidage',
        'Déplier la fiche',
        'Fermer sans enregistrer',
        '2D',
        '3D',
        'Couches',
        'Outils',
        'Ajouter un repère',
      ]
      await settled(() => expectReachable(page, mapControls))
      await settled(() => expectAboveGuidance('repliée'))

      // Rotation: the folded state is kept, going and coming back.
      await page.setViewportSize({ width: viewport.height, height: viewport.width })
      await expect(card).toHaveAttribute('data-folded', 'true')
      await settled(() =>
        expectReachable(page, [
          'Arrêter le guidage',
          'Déplier la fiche',
          'Fermer sans enregistrer',
        ]),
      )
      await settled(() => expectAboveGuidance('repliée après rotation'))
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await expect(card).toHaveAttribute('data-folded', 'true')
      await settled(() => expectReachable(page, mapControls))

      // Unfold: the typed text is still there; the state survives a rotation.
      await page.getByRole('button', { name: 'Déplier la fiche' }).click()
      await expect(card).toHaveAttribute('data-folded', 'false')
      await expect(page.getByLabel('Nom')).toHaveValue('Nom modifié')
      await page.setViewportSize({ width: viewport.height, height: viewport.width })
      await expect(card).toHaveAttribute('data-folded', 'false')
      await settled(() =>
        expectReachable(page, ['Arrêter le guidage', 'Replier la fiche']),
      )
      await settled(() => expectAboveGuidance('ouverte après rotation'))
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await expect(card).toHaveAttribute('data-folded', 'false')
      await settled(() =>
        expectReachable(page, ['Arrêter le guidage', 'Replier la fiche']),
      )
      await settled(() => expectAboveGuidance('ouverte au retour'))
    })
  })
}

test.describe('Aller à — mode immersif', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    permissions: ['geolocation'],
    geolocation: START,
  })

  test('le panneau reste disponible en mode immersif', async ({ page, backend }) => {
    void backend
    await openMap(page)
    await createAndGuide(page)
    await page.getByRole('button', { name: 'Mode immersif' }).click()
    await expect(
      page.getByRole('button', { name: 'Quitter le mode immersif' }),
    ).toBeVisible()
    await expect(page.getByTestId('guidance-panel')).toBeVisible()
    await expect(page.getByTestId('guidance-distance')).toBeVisible()
    const m = await measureLayout(page)
    expect(m.controls.filter((c) => !c.inViewport || !c.hit)).toEqual([])
    await page.getByRole('button', { name: 'Arrêter le guidage' }).click()
    await expect(page.getByTestId('guidance-panel')).toBeHidden()
  })
})
