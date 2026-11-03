import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeatherMapFrame } from '@/types'
import { formatFrameClock, formatFrameRelative } from '../formatFrameTime'
import { formatFrameDay, timelineTicks } from '../timelineTicks'

/** Dragging only moves the readout at once; the map frame (and the tiles it
 * loads around it) follows once the finger rests, or on release. */
const SCRUB_COMMIT_MS = 150

export interface TimelineBarProps {
  frames: WeatherMapFrame[]
  frameIndex: number
  playing: boolean
  now: Date
  maxTicks: number
  onPlayingChange: (playing: boolean) => void
  onStep: (delta: number) => void
  onSeek: (index: number) => void
  className?: string
}

export function TimelineBar({
  frames,
  frameIndex,
  playing,
  now,
  maxTicks,
  onPlayingChange,
  onStep,
  onSeek,
  className,
}: TimelineBarProps) {
  // The drag value only counts while the store still holds the frame it was
  // made from: once playback, a step button or the commit moves the store, it
  // is ignored.
  const [drag, setDrag] = useState<{ base: number; index: number } | null>(null)
  const pending = drag && drag.base === frameIndex ? drag.index : null
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const shownIndex = pending ?? frameIndex
  const frame = frames[shownIndex]
  if (!frame || frames.length === 0) return null

  function commit(index: number) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    onSeek(index)
  }
  function onInput(index: number) {
    onPlayingChange(false)
    setDrag({ base: frameIndex, index })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(index), SCRUB_COMMIT_MS)
  }

  const ticks = timelineTicks(frames, maxTicks)
  const last = Math.max(1, frames.length - 1)
  const observed = frame.kind === 'observed'

  return (
    <div className={className} data-testid="weather-timeline">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p
          className="text-ink-100 text-sm font-semibold tabular-nums"
          data-testid="frame-readout"
        >
          <span className="inline-block first-letter:uppercase">
            {formatFrameDay(frame)}
          </span>{' '}
          · {formatFrameClock(frame, now).replace(/^.* (?=\d+ h)/, '')}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
            observed
              ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
              : 'border-amber-400/60 bg-amber-400/15 text-amber-300',
          )}
        >
          {observed ? 'Observé' : 'Prévu'} · {formatFrameRelative(frame, now)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label="Image précédente"
          className="text-ink-300 hover:text-ink-100 flex size-9 shrink-0 items-center justify-center pointer-coarse:size-11"
        >
          <SkipBack size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? 'Pause' : 'Lecture'}
          className="bg-brand-500 text-surface-950 hover:bg-brand-400 flex size-9 shrink-0 items-center justify-center rounded-full pointer-coarse:size-11"
        >
          {playing ? (
            <Pause size={18} aria-hidden="true" />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label="Image suivante"
          className="text-ink-300 hover:text-ink-100 flex size-9 shrink-0 items-center justify-center pointer-coarse:size-11"
        >
          <SkipForward size={18} aria-hidden="true" />
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={shownIndex}
          onChange={(e) => onInput(Number(e.target.value))}
          onPointerUp={() => pending !== null && commit(pending)}
          onKeyUp={() => pending !== null && commit(pending)}
          onBlur={() => pending !== null && commit(pending)}
          aria-label="Ligne du temps"
          aria-valuetext={`${formatFrameDay(frame)}, ${formatFrameClock(frame, now)}`}
          className="accent-brand-500 h-9 min-w-0 flex-1 pointer-coarse:h-11"
        />
      </div>

      <div className="relative mx-[4.5rem] mt-0.5 h-4" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick.index}
            className="text-ink-500 absolute -translate-x-1/2 text-[10px] whitespace-nowrap tabular-nums"
            style={{ left: `${(tick.index / last) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <p className="text-ink-500 mt-1 text-[11px]">
        Période disponible : {formatFrameClock(frames[0], now)} →{' '}
        {formatFrameClock(frames[frames.length - 1], now)} (
        {observed ? 'observée' : 'prévue'})
      </p>
    </div>
  )
}
