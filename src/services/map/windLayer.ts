import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Coordinate, WeatherMapLayer, WindField } from '@/types'
import { weatherLayerColor, valueForLayer } from '@/utils/weatherMapColors'
import { advancePosition, windAt } from '@/utils/windField'

interface WindParticle {
  pos: Coordinate
  age: number
}

const WIND_PARTICLE_COUNT = 400
/** Frames before a particle respawns elsewhere — keeps trails short and
 * the field feeling continuously "alive" rather than a few long streaks. */
const WIND_PARTICLE_MAX_AGE = 100
/** Stylized animation-speed multiplier — see `advancePosition`'s own doc
 * comment (`utils/windField.ts`) for why real-world wind speed would be
 * imperceptible frame-to-frame on a map. */
const WIND_SPEED_SCALE = 60

function randomPointInBounds(map: MapLibreMap): Coordinate {
  const bounds = map.getBounds()
  return {
    lat: bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()),
    lng: bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()),
  }
}

/** Draws a smooth color-graded overlay for a non-wind layer (temperature/
 * precipitation/clouds) — Windy's signature calibrated-color-scale map,
 * confirmed live at windy.com/colors. Each real grid sample gets a soft
 * radial blob (never a fabricated interpolated grid — just visually
 * blended real values), sized to roughly cover the gap between samples
 * so the field reads as continuous rather than as isolated dots. */
function drawWeatherOverlay(
  ctx: CanvasRenderingContext2D,
  map: MapLibreMap,
  field: WindField,
  hourOffset: number,
  layer: Exclude<WeatherMapLayer, 'wind'>,
  width: number,
  height: number,
) {
  const sampleCount = field.samples.length
  if (sampleCount === 0) return
  const radius = Math.max(60, (Math.min(width, height) / Math.sqrt(sampleCount)) * 0.95)

  for (const sample of field.samples) {
    const reading = sample.hourly[hourOffset]
    if (!reading) continue
    const value = valueForLayer(layer, reading)
    const screen = map.project([sample.coordinate.lng, sample.coordinate.lat])
    const gradient = ctx.createRadialGradient(
      screen.x,
      screen.y,
      0,
      screen.x,
      screen.y,
      radius,
    )
    gradient.addColorStop(0, weatherLayerColor(layer, value, 0.55))
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Owns a `<canvas>` overlaid on the map container and a
 * `requestAnimationFrame` loop drawing the active Windy-style weather
 * layer on it (Phase 6) — a plain 2D canvas, not a MapLibre GeoJSON
 * layer, since both the particle trails and the pan/zoom-reactive color
 * overlay need per-frame screen-space redraws a style layer isn't suited
 * for. `map.project()` reprojects every point every frame, so pan/zoom/
 * rotate need no extra bookkeeping to stay correct. Every value drawn —
 * particle vectors or overlay colors — comes from the *nearest real grid
 * sample* (`utils/windField.ts`'s `windAt`) — never interpolated/
 * fabricated between samples.
 */
export function createWindLayer(map: MapLibreMap, container: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  container.appendChild(canvas)

  let field: WindField | null = null
  let hourOffset = 0
  let layer: WeatherMapLayer = 'wind'
  let particles: WindParticle[] = []
  let animationFrame: number | null = null
  let trailsNeedClear = true
  let paused = false
  const onMove = () => {
    trailsNeedClear = true
  }
  map.on('move', onMove)

  function reset() {
    particles = Array.from({ length: WIND_PARTICLE_COUNT }, () => ({
      pos: randomPointInBounds(map),
      age: Math.floor(Math.random() * WIND_PARTICLE_MAX_AGE),
    }))
  }

  function step() {
    if (!field) return
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (layer !== 'wind') {
      ctx.clearRect(0, 0, width, height)
      drawWeatherOverlay(ctx, map, field, hourOffset, layer, width, height)
      animationFrame = paused ? null : requestAnimationFrame(step)
      return
    }

    // Fading trails (Windy/earth.nullschool style): instead of wiping
    // the canvas every frame, the previous frame is faded a little so
    // each particle leaves a short tail. Cleared outright whenever the
    // camera moves (see the `move` listener) so trails never smear
    // across a pan.
    if (trailsNeedClear) {
      ctx.clearRect(0, 0, width, height)
      trailsNeedClear = false
    } else {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    // Constant on-screen speed whatever the zoom: a fixed geographic step
    // is invisible zoomed out (~1 km/px at z7) and too fast zoomed in.
    const zoomSpeedScale = WIND_SPEED_SCALE * Math.pow(2, 14 - map.getZoom())

    for (const particle of particles) {
      const screenStart = map.project([particle.pos.lng, particle.pos.lat])
      const wind = windAt(field, particle.pos, hourOffset)
      if (wind) {
        const nextPos = advancePosition(particle.pos, wind, 1 / 60, zoomSpeedScale)
        const screenEnd = map.project([nextPos.lng, nextPos.lat])
        // Colored by local speed — Windy's own convention (blue calm →
        // red gale) — so the flow field reads at a glance, not just from
        // trail motion alone.
        ctx.strokeStyle = weatherLayerColor('wind', wind.speedKmh, 0.85)
        ctx.beginPath()
        ctx.moveTo(screenStart.x, screenStart.y)
        ctx.lineTo(screenEnd.x, screenEnd.y)
        ctx.stroke()
        particle.pos = nextPos
        particle.age += 1
      } else {
        particle.age = WIND_PARTICLE_MAX_AGE + 1
      }
      const offScreen =
        screenStart.x < -20 ||
        screenStart.x > width + 20 ||
        screenStart.y < -20 ||
        screenStart.y > height + 20
      if (particle.age > WIND_PARTICLE_MAX_AGE || offScreen) {
        particle.pos = randomPointInBounds(map)
        particle.age = 0
      }
    }

    animationFrame = paused ? null : requestAnimationFrame(step)
  }

  /** Paused mode: paint a handful of frames synchronously so the
   * streamlines are visible as a still image, with no animation loop. */
  function renderStatic() {
    trailsNeedClear = true
    for (let i = 0; i < 24; i += 1) step()
    animationFrame = null
  }

  return {
    setField(
      newField: WindField | null,
      newHourOffset: number,
      newLayer: WeatherMapLayer,
    ) {
      const hadField = field !== null
      field = newField
      hourOffset = newHourOffset
      layer = newLayer
      if (field) {
        if (!hadField) reset()
        if (paused) renderStatic()
        else if (animationFrame === null) animationFrame = requestAnimationFrame(step)
      } else if (hadField) {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame)
        animationFrame = null
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
    },
    setPaused(newPaused: boolean) {
      if (paused === newPaused) return
      paused = newPaused
      if (!field) return
      if (paused) {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame)
        renderStatic()
      } else {
        trailsNeedClear = true
        animationFrame = requestAnimationFrame(step)
      }
    },
    destroy() {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      map.off('move', onMove)
      canvas.remove()
    },
  }
}
