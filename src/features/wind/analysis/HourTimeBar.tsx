import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/utils/cn'
import type { ForecastSlot } from './windTimeline'

export interface HourTimeBarProps {
  /** Slots of the displayed day, in order (one per source hour). */
  slots: ForecastSlot[]
  /** Index in the shared hourly series (`selectedHourOffset`). */
  selectedIndex: number
  /** Index of the current real hour when it is on this day. */
  nowIndex: number | null
  disabled?: boolean
  /** Spoken value (« samedi 10 octobre, 14:00, vent du NO, 12 km/h »). */
  valueText: string
  onSelect: (index: number) => void
  /** Keyboard move by whole slots; the parent may cross into the next day. */
  onStep: (delta: number) => void
  onEdge: (edge: 'start' | 'end') => void
}

/**
 * Horizontal hour scrubber: one tick per real hourly slot, a thumb on the
 * selected one, draggable by touch/pointer and usable from the keyboard
 * (arrows ±1 h, Page ±6 h, Home/End). It only reports a slot index; what
 * that index means (wind at that hour) is the parent's job.
 */
export function HourTimeBar({
  slots,
  selectedIndex,
  nowIndex,
  disabled = false,
  valueText,
  onSelect,
  onStep,
  onEdge,
}: HourTimeBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const count = slots.length
  const position = (slotIndex: number) => {
    const at = slots.findIndex((s) => s.index === slotIndex)
    if (at === -1) return null
    return count > 1 ? (at / (count - 1)) * 100 : 50
  }

  function slotFromPointer(clientX: number): number | null {
    const track = trackRef.current
    if (!track || count === 0) return null
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return slots[0].index
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return slots[Math.round(fraction * (count - 1))].index
  }

  function pick(event: PointerEvent) {
    const next = slotFromPointer(event.clientX)
    if (next !== null && next !== selectedIndex) onSelect(next)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || count === 0) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pick(event)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (draggingRef.current) pick(event)
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const steps: Record<string, () => void> = {
      ArrowRight: () => onStep(1),
      ArrowUp: () => onStep(1),
      ArrowLeft: () => onStep(-1),
      ArrowDown: () => onStep(-1),
      PageUp: () => onStep(6),
      PageDown: () => onStep(-6),
      Home: () => onEdge('start'),
      End: () => onEdge('end'),
    }
    const action = steps[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  const selectedPosition = position(selectedIndex)
  const nowPosition = nowIndex === null ? null : position(nowIndex)
  const first = slots[0]?.index ?? 0
  const last = slots[count - 1]?.index ?? 0

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Heure de la prévision de vent"
      aria-orientation="horizontal"
      aria-valuemin={first}
      aria-valuemax={last}
      aria-valuenow={selectedIndex}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      data-testid="wind-hour-bar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={cn(
        'relative mx-3 h-[3.25rem] touch-pan-y rounded-md select-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      {/* rail */}
      <div
        className="bg-surface-700 absolute inset-x-0 top-4 h-1 rounded-full"
        aria-hidden="true"
      />
      {selectedPosition !== null && (
        <div
          className="bg-brand-400/70 absolute top-4 left-0 h-1 rounded-full"
          style={{ width: `${selectedPosition}%` }}
          aria-hidden="true"
        />
      )}
      {/* one tick per real hourly slot; hour labels every 6 h */}
      {slots.map((slot, i) => {
        const left = count > 1 ? (i / (count - 1)) * 100 : 50
        const major = slot.hour % 3 === 0
        const labelled = slot.hour % 6 === 0
        return (
          <div
            key={slot.index}
            className="absolute top-0 h-full"
            style={{ left: `${left}%` }}
            aria-hidden="true"
          >
            <span
              className={cn(
                'bg-ink-500 absolute top-[1.4rem] -translate-x-1/2 rounded-full',
                major ? 'h-2.5 w-0.5' : 'h-1.5 w-px opacity-70',
              )}
            />
            {labelled && (
              <span className="text-ink-300 absolute top-9 -translate-x-1/2 text-[11px] tabular-nums">
                {String(slot.hour).padStart(2, '0')}
              </span>
            )}
          </div>
        )
      })}
      {nowPosition !== null && (
        <span
          data-testid="wind-now-marker"
          className="border-b-status-warning absolute top-[1.9rem] -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent"
          style={{ left: `${nowPosition}%` }}
          aria-hidden="true"
        />
      )}
      {selectedPosition !== null && (
        <span
          data-testid="wind-hour-thumb"
          className="bg-brand-400 border-surface-950 ring-brand-400/40 absolute top-[0.35rem] size-5 -translate-x-1/2 rounded-full border-2 ring-4"
          style={{ left: `${selectedPosition}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
