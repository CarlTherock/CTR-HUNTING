/* eslint-disable @typescript-eslint/no-non-null-assertion -- test code asserts presence right before use */
import { afterEach, describe, expect, it } from 'vitest'
import type Dexie from 'dexie'
import type { Track, Waypoint } from '@/types'
import { createTestDatabase } from '@/test/backupFixtures'
import { buildGpx, escapeXml, formatNumber } from './gpxExport'
import { GpxImportError, parseGpx, parseStrictNumber } from './gpxImport'
import {
  commitGpxImport,
  exportGpx,
  listExportChoices,
  planGpxImport,
} from './gpxService'

const opened: Dexie[] = []
function newDb(): Dexie {
  const database = createTestDatabase()
  opened.push(database)
  return database
}
afterEach(async () => {
  while (opened.length) {
    const database = opened.pop()!
    database.close()
    await database.delete()
  }
})

const wp = (overrides: Partial<Waypoint> & { territoryId?: string } = {}): Waypoint => ({
  id: 'wp-1',
  name: 'Poste',
  coordinate: { lat: 46.12345678901234, lng: -71.98765432109876 },
  category: 'stand_blind',
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
  ...overrides,
})

const track = (overrides: Partial<Track> = {}): Track => ({
  id: 'tr-1',
  name: 'Sortie',
  startedAt: '2026-09-05T09:00:00.000Z',
  endedAt: '2026-09-05T10:00:00.000Z',
  points: [
    {
      lat: 46.1,
      lng: -71.1,
      altitude: 100.5,
      accuracyMeters: 5,
      timestamp: '2026-09-05T09:00:00.000Z',
    },
    { lat: 46.10001, lng: -71.10002, timestamp: '2026-09-05T09:00:05.000Z' },
  ],
  ...overrides,
})

describe('number formatting', () => {
  it.each([
    0, -0.5, 46.12345678901234, -71.98765432109876, 90, -180, 3.123456789012346e-6, 1e-7,
    -2.5e-9, 123456789.12345679,
  ])('writes %s so that it parses back to the identical double', (value) => {
    const text = formatNumber(value)
    expect(text).not.toMatch(/e/i)
    expect(parseStrictNumber(text)).toBe(value === 0 ? 0 : value)
  })

  it('parses numbers strictly', () => {
    expect(parseStrictNumber('46.5')).toBe(46.5)
    expect(parseStrictNumber(' -1e2 ')).toBe(-100)
    for (const bad of [
      '',
      'abc',
      '1,5',
      'NaN',
      'Infinity',
      '0x10',
      '1e999',
      '--1',
      null,
      undefined,
    ]) {
      expect(parseStrictNumber(bad as string | null)).toBeNull()
    }
  })
})

describe('GPX export', () => {
  it('writes a GPX 1.1 document with standard elements and namespaced extensions', () => {
    const xml = buildGpx({
      waypoints: [
        wp({
          coordinate: { lat: 46.5, lng: -71.5, altitude: 231.4, accuracyMeters: 4.5 },
          notes: 'Vent N',
          color: '#22c55e',
          optimalWindDirections: [0, 45],
          ...{ territoryId: 't1' },
        }),
      ],
      tracks: [track()],
      territories: [{ id: 't1', name: 'Secteur nord' }],
      now: new Date('2026-10-07T12:00:00Z'),
      appVersion: '0.1.0',
    })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<gpx version="1.1"')
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"')
    expect(xml).toContain('<wpt lat="46.5" lon="-71.5">')
    expect(xml).toContain('<ele>231.4</ele>')
    expect(xml).toContain('<time>2026-09-03T12:00:00.000Z</time>')
    expect(xml).toContain('<name>Poste</name>')
    expect(xml).toContain('<desc>Vent N</desc>')
    expect(xml).toContain('<sym>Tree</sym>')
    expect(xml).toContain('<trkpt lat="46.1" lon="-71.1">')
    expect(xml).toContain('territory="Secteur nord"')
    // Well-formed XML:
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
  })

  it('escapes markup and drops characters that XML 1.0 cannot carry', () => {
    expect(escapeXml('<a href="x">&\'</a>\u0000\u0007ok')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;ok',
    )
  })
})

describe('GPX round trip', () => {
  it('returns waypoints and tracks with identical numbers, text and extensions', () => {
    const waypoints: Waypoint[] = [
      wp({
        notes: 'Vent <b>N</b> & "NE" — éèà 🦌',
        color: '#a855f7',
        optimalWindDirections: [0, 45, 315],
      }),
      wp({
        id: 'wp-2',
        name: 'Petit',
        coordinate: { lat: 3.123456789012346e-6, lng: -1.5e-7, altitude: -12.25 },
        category: 'water',
      }),
      wp({
        id: 'wp-3',
        name: 'Pôle',
        coordinate: { lat: 90, lng: -180, accuracyMeters: 3.25 },
        category: 'hazard',
      }),
      wp({
        id: 'wp-4',
        name: 'Zéro',
        coordinate: { lat: 0, lng: 0 },
        category: 'custom',
      }),
    ]
    const tracks = [
      track(),
      track({
        id: 'tr-2',
        name: 'Vide-ish',
        points: [{ lat: 1, lng: 2, timestamp: '2026-09-05T09:00:00.000Z' }],
      }),
    ]
    const xml = buildGpx({ waypoints, tracks })
    const parsed = parseGpx(xml)

    expect(parsed.issues.filter((i) => i.level === 'warning')).toEqual([])
    expect(parsed.waypoints).toHaveLength(4)
    parsed.waypoints.forEach((got, index) => {
      const want = waypoints[index]
      expect(got.id).toBe(want.id)
      expect(got.name).toBe(want.name)
      expect(got.notes).toBe(want.notes)
      expect(got.coordinate).toEqual(want.coordinate)
      expect(got.category).toBe(want.category)
      expect(got.color).toBe(want.color)
      expect(got.optimalWindDirections).toEqual(want.optimalWindDirections)
      expect(got.createdAt).toBe(want.createdAt)
      expect(got.updatedAt).toBe(want.updatedAt)
    })
    expect(parsed.tracks).toHaveLength(2)
    expect(parsed.tracks[0].points).toEqual(tracks[0].points)
    expect(parsed.tracks[0].startedAt).toBe(tracks[0].startedAt)
    expect(parsed.tracks[0].endedAt).toBe(tracks[0].endedAt)
    expect(parsed.tracks[0].id).toBe('tr-1')
    expect(parsed.tracks[0].distanceMeters).toBeGreaterThan(0)
  })

  it('round-trips a big track with exact coordinates', () => {
    const points = Array.from({ length: 5000 }, (_, i) => ({
      lat: 46 + Math.sin(i) * 0.123456789,
      lng: -71 + Math.cos(i) * 0.987654321,
      timestamp: new Date(1_790_000_000_000 + i * 1000).toISOString(),
    }))
    const parsed = parseGpx(buildGpx({ waypoints: [], tracks: [track({ points })] }))
    expect(parsed.tracks[0].points).toEqual(points)
  })
})

describe('GPX import of third-party files', () => {
  const thirdParty = `<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="45.5" lon="-72.25"><ele>120</ele><name>Camp</name><sym>Campground</sym></wpt>
  <wpt lat="45.6" lon="-72.35"><name>  </name></wpt>
  <rte><name>Itinéraire</name><rtept lat="1" lon="1"/></rte>
  <trk><name>Marche</name><trkseg>
    <trkpt lat="45.5" lon="-72.2"><time>2026-09-01T10:00:00Z</time></trkpt>
    <trkpt lat="45.5001" lon="-72.2001"></trkpt>
  </trkseg><trkseg>
    <trkpt lat="45.5002" lon="-72.2002"><time>2026-09-01T10:05:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

  it('maps standard elements, fills defaults and reports what it did', () => {
    const now = new Date('2026-10-07T00:00:00Z')
    const parsed = parseGpx(thirdParty, { now })
    expect(parsed.waypoints.map((w) => w.name)).toEqual(['Camp', 'Point importé'])
    expect(parsed.waypoints[0]).toMatchObject({
      category: 'campsite',
      coordinate: { lat: 45.5, lng: -72.25, altitude: 120 },
      timeMissing: true,
      createdAt: now.toISOString(),
    })
    expect(parsed.waypoints[0].id).toBeUndefined()
    expect(parsed.stats.routesIgnored).toBe(1)
    expect(parsed.tracks).toHaveLength(1)
    expect(parsed.tracks[0].points).toHaveLength(3)
    expect(parsed.tracks[0].pointsWithoutTime).toBe(1)
    expect(parsed.tracks[0].breaks).toEqual([2])
    expect(parsed.tracks[0].points[1].timestamp).toBe('2026-09-01T10:00:00.000Z')
    const messages = parsed.issues.map((i) => i.message).join('\n')
    expect(messages).toMatch(/itinéraire/)
    expect(messages).toMatch(/sans heure/)
    expect(messages).toMatch(/segments conservés/)
  })

  it('refuses lat/lon that are out of range, non-finite or not numbers, and reports them', () => {
    const bad = `<gpx version="1.1"><wpt lat="91" lon="0"><name>A</name></wpt>
      <wpt lat="0" lon="-180.0001"><name>B</name></wpt>
      <wpt lat="abc" lon="0"><name>C</name></wpt>
      <wpt lat="1e999" lon="0"><name>D</name></wpt>
      <wpt lat="NaN" lon="0"><name>E</name></wpt>
      <wpt lat="" lon="0"><name>F</name></wpt>
      <wpt lat="10"><name>G</name></wpt>
      <wpt lat="-90" lon="180"><name>OK</name></wpt>
      <trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="95" lon="1"/><trkpt lat="x" lon="1"/></trkseg></trk>
      <trk><trkseg><trkpt lat="200" lon="1"/></trkseg></trk></gpx>`
    const parsed = parseGpx(bad)
    expect(parsed.waypoints.map((w) => w.name)).toEqual(['OK'])
    expect(parsed.stats.waypointsInvalid).toBe(7)
    expect(parsed.tracks).toHaveLength(1)
    expect(parsed.tracks[0].points).toHaveLength(1)
    expect(parsed.stats.pointsInvalid).toBe(3)
    expect(parsed.stats.tracksSkipped).toBe(1)
  })

  it('ignores unsafe ids, unknown categories and colours coming from a file', () => {
    const xml = `<gpx version="1.1" xmlns:ctr="https://carltherock.github.io/CTR-HUNTING/ns/gpx/1">
      <wpt lat="1" lon="1"><name>x</name><extensions>
        <ctr:waypoint id="&lt;img src=x onerror=alert(1)&gt;" category="hax" color="red" territoryId="../etc"/>
      </extensions></wpt></gpx>`
    const [item] = parseGpx(xml).waypoints
    expect(item.id).toBeUndefined()
    expect(item.category).toBe('general')
    expect(item.color).toBeUndefined()
    expect(item.territoryId).toBeUndefined()
  })

  it('keeps HTML in names and notes as inert text', () => {
    const xml = `<gpx version="1.1"><wpt lat="1" lon="1"><name>&lt;b&gt;gras&lt;/b&gt;</name>
      <desc>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</desc></wpt>
      <wpt lat="2" lon="2"><name><![CDATA[<i>cdata</i>]]></name></wpt></gpx>`
    const [a, b] = parseGpx(xml).waypoints
    expect(a.name).toBe('<b>gras</b>')
    expect(a.notes).toBe('<script>alert(1)</script><img src=x onerror=alert(1)>')
    expect(b.name).toBe('<i>cdata</i>')
    expect(document.querySelector('script')).toBeNull()
  })

  it('truncates absurdly long names and says so', () => {
    const xml = `<gpx version="1.1"><wpt lat="1" lon="1"><name>${'n'.repeat(500)}</name></wpt></gpx>`
    const parsed = parseGpx(xml)
    expect(parsed.waypoints[0].name).toHaveLength(200)
    expect(parsed.issues.some((i) => /tronqué/.test(i.message))).toBe(true)
  })
})

describe('GPX import refusals', () => {
  const code = (fn: () => unknown) => {
    try {
      fn()
    } catch (error) {
      return error instanceof GpxImportError ? error.code : 'other'
    }
    return 'none'
  }

  it('refuses a file over the size limit', () => {
    expect(code(() => parseGpx('x'.repeat(10 * 1024 * 1024 + 1)))).toBe('too-large')
    expect(code(() => parseGpx('<gpx/>'.padEnd(2000, ' '), { maxBytes: 1000 }))).toBe(
      'too-large',
    )
  })

  it('refuses too many waypoints before parsing the DOM', () => {
    const xml = `<gpx version="1.1">${'<wpt lat="1" lon="1"/>'.repeat(10_001)}</gpx>`
    expect(code(() => parseGpx(xml))).toBe('limits')
  })

  it('refuses too many track points', () => {
    const xml = `<gpx version="1.1"><trk><trkseg>${'<trkpt lat="1" lon="1"></trkpt>'.repeat(500_001)}</trkseg></trk></gpx>`
    expect(code(() => parseGpx(xml, { maxBytes: 100 * 1024 * 1024 }))).toBe('limits')
  })

  it('refuses DOCTYPE / ENTITY declarations', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa">]><gpx version="1.1"><wpt lat="1" lon="1"><name>&a;</name></wpt></gpx>`
    expect(code(() => parseGpx(xml))).toBe('unsafe')
  })

  it('refuses malformed, truncated, and non-GPX documents', () => {
    const good = buildGpx({ waypoints: [wp()], tracks: [] })
    expect(code(() => parseGpx(good.slice(0, good.length - 30)))).toBe('not-xml')
    expect(code(() => parseGpx('ceci n’est pas du XML'))).toBe('not-xml')
    expect(code(() => parseGpx('<html><body>hi</body></html>'))).toBe('not-gpx')
    expect(code(() => parseGpx(''))).toBe('not-xml')
  })
})

describe('GPX with the database', () => {
  async function seed(database: Dexie) {
    await database.table('territories').add({
      id: 'terr-1',
      name: 'Secteur nord',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    await database.table('waypoints').bulkAdd([
      wp({ ...{ territoryId: 'terr-1' }, notes: 'a' }),
      wp({
        id: 'wp-2',
        name: 'Hors territoire',
        coordinate: { lat: 46.2, lng: -71.9 },
        category: 'parking',
      }),
    ])
    await database
      .table('tracks')
      .bulkAdd([
        { ...track(), territoryId: 'terr-1' },
        track({ id: 'tr-2', name: 'Autre trace' }),
      ])
  }

  it('exports everything, one territory, one waypoint or one track', async () => {
    const database = newDb()
    await seed(database)
    const now = new Date(2026, 9, 7, 12)

    const all = await exportGpx({ kind: 'all' }, { database, now })
    expect(all).toMatchObject({
      waypointCount: 2,
      trackCount: 2,
      fileName: 'ctr-hunting-tout-2026-10-07.gpx',
    })

    const terr = await exportGpx(
      { kind: 'territory', territoryId: 'terr-1' },
      { database, now },
    )
    expect(terr).toMatchObject({
      waypointCount: 1,
      trackCount: 1,
      fileName: 'ctr-hunting-secteur-nord-2026-10-07.gpx',
    })
    expect(terr.xml).not.toContain('Hors territoire')

    const one = await exportGpx(
      { kind: 'waypoint', waypointId: 'wp-2' },
      { database, now },
    )
    expect(one).toMatchObject({ waypointCount: 1, trackCount: 0 })
    expect(one.xml).toContain('Hors territoire')

    const trk = await exportGpx({ kind: 'track', trackId: 'tr-2' }, { database, now })
    expect(trk).toMatchObject({ waypointCount: 0, trackCount: 1 })

    const choices = await listExportChoices(database)
    expect(choices.territories).toEqual([{ id: 'terr-1', name: 'Secteur nord' }])
    expect(choices.waypoints).toHaveLength(2)
  })

  it('exports from a database without territories', async () => {
    const database = createTestDatabase({ territories: false })
    opened.push(database)
    await database.table('waypoints').add(wp())
    const result = await exportGpx({ kind: 'all' }, { database })
    expect(result.waypointCount).toBe(1)
    expect((await listExportChoices(database)).territories).toEqual([])
  })

  it('export -> wipe -> import restores waypoints and tracks exactly, then re-import adds nothing', async () => {
    const source = newDb()
    await seed(source)
    const { xml } = await exportGpx({ kind: 'all' }, { database: source })
    const wanted = {
      waypoints: await source.table('waypoints').toArray(),
      tracks: await source.table('tracks').toArray(),
    }

    const target = newDb()
    await target.table('territories').add({
      id: 'terr-1',
      name: 'Secteur nord',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const plan = await planGpxImport(parseGpx(xml), { database: target })
    expect(plan.waypoints.every((p) => p.status === 'new')).toBe(true)
    const report = await commitGpxImport(plan, { database: target })
    expect(report).toEqual({ waypointsAdded: 2, tracksAdded: 2, alreadyPresent: 0 })

    const waypoints = await target.table('waypoints').toArray()
    for (const want of wanted.waypoints) {
      const got = waypoints.find((w) => w.id === want.id)!
      expect(got.coordinate).toEqual(want.coordinate)
      expect(got.name).toBe(want.name)
      expect(got.category).toBe(want.category)
      expect(got.territoryId).toBe(want.territoryId)
    }
    const tracks = await target.table('tracks').toArray()
    for (const want of wanted.tracks) {
      const got = tracks.find((t) => t.id === want.id)!
      expect(got.points).toEqual(want.points)
      expect(got.territoryId).toBe(want.territoryId)
    }

    const again = await planGpxImport(parseGpx(xml), { database: target })
    const second = await commitGpxImport(again, { database: target })
    expect(second).toEqual({ waypointsAdded: 0, tracksAdded: 0, alreadyPresent: 4 })
    expect(await target.table('waypoints').count()).toBe(2)
  })

  it('never overwrites: a same-id file item with other content gets a new id; unknown territory is dropped', async () => {
    const target = newDb()
    await target
      .table('waypoints')
      .add(wp({ name: 'Local', coordinate: { lat: 10, lng: 10 } }))
    const xml = buildGpx({
      waypoints: [
        wp({
          name: 'Du fichier',
          coordinate: { lat: 20, lng: 20 },
          ...{ territoryId: 'inconnu' },
        }),
      ],
      tracks: [],
    })
    const plan = await planGpxImport(parseGpx(xml), { database: target })
    expect(plan.territoryDropped).toBe(1)
    await commitGpxImport(plan, { database: target })
    const rows = await target.table('waypoints').toArray()
    expect(rows).toHaveLength(2)
    expect(rows.find((w) => w.id === 'wp-1')!.coordinate).toEqual({ lat: 10, lng: 10 })
    const added = rows.find((w) => w.name === 'Du fichier')!
    expect(added.id).not.toBe('wp-1')
    expect(added.territoryId).toBeUndefined()
  })
})
