import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefCallback,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { MapToolsContext } from './mapToolsContext'

/**
 * Where a map tool's trigger is rendered.
 *
 * Every map tool used to position its own floating button with a hard-coded
 * `top-[Nrem]` offset; with eleven of them stacked, the last ones fell off
 * the screen on phones and in landscape. Tools now declare *what* they are
 * (`ToolTrigger`) and the map page decides *where* they appear:
 *
 *  - `rail`  — a few always-visible quick actions (right edge of the map);
 *  - `sheet` — everything else, inside the "Outils" bottom sheet.
 *
 * Outside a `MapToolsProvider` (unit tests, isolated use) a trigger simply
 * renders in place, so a control never silently disappears.
 */
export type ToolPlacement = 'rail' | 'sheet'

const RAIL_BUTTON =
  'border-surface-600 bg-surface-900/90 flex shrink-0 items-center justify-center rounded-lg border shadow-lg backdrop-blur-sm transition-colors'

const SHEET_ROW =
  'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors'

export interface ToolTriggerProps {
  icon: ReactNode
  /** Visible text in the sheet, accessible name on the rail. */
  label: string
  onClick: () => void
  placement?: ToolPlacement
  /** Highlights the tool as active/on. */
  active?: boolean
  /** Exposes a toggle state to assistive tech (`aria-pressed`). */
  pressed?: boolean
  disabled?: boolean
  title?: string
  /** Visual order inside the rail/sheet (lower first). */
  order?: number
  /** Field Mode: oversized touch target for gloved use. */
  large?: boolean
  /** Rail only: a secondary tool, hidden while a full-width bottom panel
   * (« Analyse du vent ») is open so the rail keeps only essential buttons. */
  secondary?: boolean
}

export function ToolTrigger({
  icon,
  label,
  onClick,
  placement = 'sheet',
  active = false,
  pressed,
  disabled = false,
  title,
  order = 0,
  large = false,
  secondary = false,
}: ToolTriggerProps) {
  const ctx = useContext(MapToolsContext)
  const onRail = placement === 'rail'

  const button = (
    <button
      type="button"
      onClick={() => {
        // The sheet closes first so a tool that arms a map mode leaves the
        // map visible and tappable.
        if (!onRail) ctx?.closeSheet()
        onClick()
      }}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={onRail ? label : undefined}
      title={title ?? label}
      data-rail-secondary={onRail && secondary ? 'true' : undefined}
      style={{ order }}
      className={cn(
        onRail ? RAIL_BUTTON : SHEET_ROW,
        onRail && (large ? 'h-16 w-16' : 'h-11 w-11'),
        !onRail &&
          (active
            ? 'border-brand-400 bg-brand-500/15 text-brand-400'
            : 'border-surface-600 text-ink-100 hover:bg-surface-800'),
        onRail &&
          (active
            ? 'bg-brand-500/15 text-brand-400'
            : 'text-ink-300 hover:bg-surface-800'),
        disabled && 'text-ink-700 cursor-not-allowed',
      )}
    >
      {icon}
      {!onRail && <span>{label}</span>}
    </button>
  )

  if (!ctx) return button
  const host = onRail ? ctx.railHost : ctx.sheetHost
  return host ? createPortal(button, host) : null
}

/** Renders arbitrary tool UI (not just a button) into the sheet. */
export function ToolSlot({
  children,
  order = 0,
  placement = 'sheet',
  className,
  secondary = false,
}: {
  children: ReactNode
  order?: number
  /** Rail only: hidden while a full-width bottom panel is open. */
  secondary?: boolean
  /** Classes of the slot's own wrapper (e.g. to drop it from the layout). */
  className?: string
  /** `rail`: always-visible column on the right edge; `sheet`: Outils. */
  placement?: ToolPlacement
}) {
  const ctx = useContext(MapToolsContext)
  const content = (
    <div
      style={{ order }}
      className={className}
      data-rail-secondary={placement === 'rail' && secondary ? 'true' : undefined}
    >
      {children}
    </div>
  )
  if (!ctx) return content
  const host = placement === 'rail' ? ctx.railHost : ctx.sheetHost
  return host ? createPortal(content, host) : null
}

export interface MapToolRailProps {
  setHost: RefCallback<HTMLDivElement>
}

/**
 * Quick-action column on the right edge of the map, below MapLibre's own
 * compass control (the zoom +/− buttons were removed: zoom is done by
 * gesture, keyboard or the Zoom entry of « Outils »; the compass grows to 44 px
 * on touch devices, hence the larger offset there). If the screen is too short it wraps into a second
 * column instead of running off-screen.
 */
export function MapToolRail({ setHost }: MapToolRailProps) {
  return (
    <div
      ref={setHost}
      data-testid="map-tool-rail"
      className="absolute top-[var(--rail-top)] right-2 z-10 flex max-h-[calc(100%-var(--rail-top)-3rem-var(--sheet-height,0px))] flex-col flex-wrap-reverse content-start items-end gap-2 [--rail-top:4rem] pointer-coarse:[--rail-top:4rem]"
    />
  )
}

export interface ToolsSheetProps {
  open: boolean
  onClose: () => void
  setHost: RefCallback<HTMLDivElement>
}

/**
 * Bottom sheet listing the map tools. It stays inside the map area (so it
 * never covers the app navigation), closes with Escape, the close button or
 * a tap on the dimmed map, and gives focus back to whatever opened it.
 */
export function ToolsSheet({ open, onClose, setHost }: ToolsSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [open, onClose])

  const hostRef = useCallback(
    (node: HTMLDivElement | null) => {
      setHost(node)
    },
    [setHost],
  )

  if (!open) return null
  return (
    <>
      <div
        className="absolute inset-0 z-30 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
        data-testid="tools-sheet-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Outils de la carte"
        tabIndex={-1}
        className="border-surface-600 bg-surface-900 absolute inset-x-0 bottom-0 z-40 max-h-[75%] overflow-y-auto rounded-t-xl border-t p-3 shadow-2xl outline-none"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-ink-100 text-sm font-semibold">Outils</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les outils"
            className="text-ink-300 hover:text-ink-100 flex h-11 w-11 items-center justify-center rounded-lg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div ref={hostRef} className="flex flex-col gap-2" />
      </div>
    </>
  )
}
