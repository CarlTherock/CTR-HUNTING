import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { cn } from '@/utils/cn'
import {
  clientToNormalized,
  clientToUnits,
  normalizedToUnits,
  panBy,
  screenMapping,
  visibleBox,
  zoomBy,
  type ZoomState,
} from '../anatomyLogic'
import type { Illustration, Point } from '../types'

const TAP_SLOP_PX = 8
const HANDLE_PX = 11
const HANDLE_HIT_PX = 24
const KEY_STEP = 0.01
const KEY_STEP_BIG = 0.05

interface Props {
  illustration: Illustration
  point: Point | null
  onPoint: (point: Point) => void
  zoom: ZoomState
  onZoom: (zoom: ZoomState) => void
  annotations: boolean
  highlightedRegionId: string | null
}

interface Tracked {
  x: number
  y: number
}

/** The drawing. Three gestures, kept apart so none steals another:
 *  - a short tap on the drawing places the point;
 *  - dragging the drawing pans it (only when zoomed in);
 *  - dragging the round handle moves the point;
 *  - two fingers pinch to zoom.
 * The point is stored as a 0..1 position on the whole drawing, so zoom, pan
 * and resizing never change it. */
export function AnatomyCanvas({
  illustration: ill,
  point,
  onPoint,
  zoom,
  onZoom,
  annotations,
  highlightedRegionId,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, Tracked>())
  const gesture = useRef<{
    startX: number
    startY: number
    moved: boolean
    lastX: number
    lastY: number
    pinchStartDistance: number
    pinchStartZoom: ZoomState
    pinchAnchor: Point
    pinched: boolean
  } | null>(null)
  const dragging = useRef<number | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = svgRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const box = visibleBox(ill, zoom)
  const pixelsPerUnit =
    size.width > 0 ? screenMapping({ left: 0, top: 0, ...size }, box).pixelsPerUnit : 1

  function currentRect() {
    const rect = svgRef.current?.getBoundingClientRect()
    return rect
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : null
  }

  function placeFromClient(clientX: number, clientY: number) {
    const rect = currentRect()
    if (!rect) return
    onPoint(clientToNormalized(rect, box, ill, { x: clientX, y: clientY }))
  }

  function onSurfaceDown(event: PointerEvent<SVGSVGElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    svgRef.current?.setPointerCapture(event.pointerId)
    const rect = currentRect()
    if (pointers.current.size === 1) {
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        pinchStartDistance: 0,
        pinchStartZoom: zoom,
        pinchAnchor: { x: ill.width / 2, y: ill.height / 2 },
        pinched: false,
      }
    } else if (pointers.current.size === 2 && gesture.current && rect) {
      const [a, b] = [...pointers.current.values()]
      if (a && b) {
        gesture.current.pinchStartDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1
        gesture.current.pinchStartZoom = zoom
        gesture.current.pinchAnchor = clientToUnits(rect, box, {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        })
        gesture.current.pinched = true
      }
    }
  }

  function onSurfaceMove(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const g = gesture.current
    if (pointers.current.size >= 2 && g.pinched) {
      const [a, b] = [...pointers.current.values()]
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        onZoom(
          zoomBy(ill, g.pinchStartZoom, distance / g.pinchStartDistance, g.pinchAnchor),
        )
        g.moved = true
      }
      return
    }
    const travelled = Math.hypot(event.clientX - g.startX, event.clientY - g.startY)
    if (travelled > TAP_SLOP_PX) g.moved = true
    if (g.moved && zoom.scale > 1 && !g.pinched) {
      onZoom(
        panBy(
          ill,
          zoom,
          -(event.clientX - g.lastX) / pixelsPerUnit,
          -(event.clientY - g.lastY) / pixelsPerUnit,
        ),
      )
    }
    g.lastX = event.clientX
    g.lastY = event.clientY
  }

  function onSurfaceUp(event: PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    pointers.current.delete(event.pointerId)
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId)
    }
    if (!g) return
    if (pointers.current.size === 0) {
      const isTap = !g.moved && !g.pinched
      gesture.current = null
      if (isTap) placeFromClient(event.clientX, event.clientY)
    }
  }

  function onSurfaceCancel(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 0) gesture.current = null
  }

  function onHandleDown(event: PointerEvent<SVGGElement>) {
    event.stopPropagation()
    event.preventDefault()
    dragging.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onHandleMove(event: PointerEvent<SVGGElement>) {
    if (dragging.current !== event.pointerId) return
    event.stopPropagation()
    placeFromClient(event.clientX, event.clientY)
  }

  function onHandleUp(event: PointerEvent<SVGGElement>) {
    if (dragging.current !== event.pointerId) return
    event.stopPropagation()
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function onHandleKey(event: KeyboardEvent<SVGGElement>) {
    if (!point) return
    const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    onPoint({
      x: Math.min(1, Math.max(0, point.x + move.x)),
      y: Math.min(1, Math.max(0, point.y + move.y)),
    })
  }

  function onWheel(event: React.WheelEvent<SVGSVGElement>) {
    const rect = currentRect()
    if (!rect) return
    const anchor = clientToUnits(rect, box, { x: event.clientX, y: event.clientY })
    onZoom(zoomBy(ill, zoom, event.deltaY < 0 ? 1.15 : 1 / 1.15, anchor))
  }

  const units = point ? normalizedToUnits(ill, point) : null
  const handleRadius = HANDLE_PX / pixelsPerUnit
  const fontSize = 11 / pixelsPerUnit

  return (
    <svg
      ref={svgRef}
      role="group"
      aria-label={`Dessin schématique : ${ill.species === 'deer' ? 'cerf de Virginie' : 'orignal'}, ${ill.viewLabel}`}
      data-testid="anatomy-canvas"
      data-species={ill.species}
      data-scale={zoom.scale.toFixed(3)}
      data-box={`${box.x.toFixed(2)},${box.y.toFixed(2)},${box.w.toFixed(2)},${box.h.toFixed(2)}`}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full touch-none select-none"
      onPointerDown={onSurfaceDown}
      onPointerMove={onSurfaceMove}
      onPointerUp={onSurfaceUp}
      onPointerCancel={onSurfaceCancel}
      onWheel={onWheel}
    >
      <defs>
        <clipPath id={`clip-${ill.id}`}>
          {ill.silhouette.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </clipPath>
      </defs>
      {ill.secondary.map((d, index) => (
        <path
          key={index}
          d={d}
          className="fill-surface-800 stroke-ink-500"
          strokeWidth={1 / pixelsPerUnit}
          opacity={0.7}
        />
      ))}
      {ill.silhouette.map((d, index) => (
        <path
          key={index}
          d={d}
          className="fill-surface-700 stroke-ink-300"
          strokeWidth={1.5 / pixelsPerUnit}
          strokeLinejoin="round"
        />
      ))}

      {highlightedRegionId &&
        ill.regions
          .filter((region) => region.id === highlightedRegionId)
          .map((region) => (
            <polygon
              key={region.id}
              data-testid="highlighted-region"
              clipPath={`url(#clip-${ill.id})`}
              points={region.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
              className="fill-brand-400/25"
            />
          ))}

      {annotations &&
        ill.structures.map((structure) => {
          const common = {
            fill: structure.shape.kind === 'ellipse' ? 'rgba(239,68,68,0.18)' : 'none',
            stroke: 'rgb(248,113,113)',
            strokeWidth: 1.5 / pixelsPerUnit,
            strokeDasharray: `${5 / pixelsPerUnit} ${3 / pixelsPerUnit}`,
          }
          return (
            <g key={structure.id} data-testid={`structure-${structure.id}`}>
              {structure.shape.kind === 'ellipse' ? (
                <ellipse
                  cx={structure.shape.cx}
                  cy={structure.shape.cy}
                  rx={structure.shape.rx}
                  ry={structure.shape.ry}
                  {...common}
                />
              ) : (
                <path d={structure.shape.d} {...common} />
              )}
            </g>
          )
        })}

      {annotations &&
        ill.structures.map((structure) => {
          const anchor = structure.labelAt
          return (
            <text
              key={structure.id}
              x={anchor.x}
              y={anchor.y}
              textAnchor="middle"
              fontSize={fontSize}
              className="fill-ink-100"
              paintOrder="stroke"
              stroke="rgba(0,0,0,0.65)"
              strokeWidth={3 / pixelsPerUnit}
            >
              {structure.label}
            </text>
          )
        })}

      {units && (
        <g
          data-testid="impact-handle"
          data-x={point?.x.toFixed(4)}
          data-y={point?.y.toFixed(4)}
          role="button"
          tabIndex={0}
          aria-label="Point d’impact présumé. Glissez-le ou utilisez les flèches du clavier pour le déplacer."
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          className={cn('cursor-grab outline-none')}
        >
          <circle
            cx={units.x}
            cy={units.y}
            r={HANDLE_HIT_PX / pixelsPerUnit}
            fill="transparent"
          />
          <circle
            cx={units.x}
            cy={units.y}
            r={handleRadius}
            fill="rgba(251,191,36,0.35)"
            stroke="rgb(251,191,36)"
            strokeWidth={2.5 / pixelsPerUnit}
          />
          <circle
            cx={units.x}
            cy={units.y}
            r={2.5 / pixelsPerUnit}
            fill="rgb(251,191,36)"
          />
        </g>
      )}
    </svg>
  )
}
