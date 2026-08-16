import { useState } from 'react'
import { Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import type { WaypointCategory, WaypointColor } from '@/types'
import { CATEGORY_OPTIONS, COLOR_OPTIONS, DEFAULT_WAYPOINT_COLOR as DEFAULT_COLOR } from '../categories'
import { useWaypointsStore } from '../state/waypointsStore'
import { WaypointPhotos } from './WaypointPhotos'

/** Bottom-sheet form for a waypoint's name/category/color/notes, opened
 * either right after placing a new one or by tapping an existing marker.
 * Holds its own draft state — edits only reach the store (and Dexie) on
 * "Save"; closing any other way discards them, leaving the previously
 * persisted values untouched. */
export function WaypointEditPanel() {
  const editingId = useWaypointsStore((state) => state.editingId)
  const waypoint = useWaypointsStore((state) =>
    state.waypoints.find((w) => w.id === state.editingId),
  )
  const updateWaypoint = useWaypointsStore((state) => state.updateWaypoint)
  const deleteWaypoint = useWaypointsStore((state) => state.deleteWaypoint)
  const closeEdit = useWaypointsStore((state) => state.closeEdit)

  const [name, setName] = useState(waypoint?.name ?? '')
  const [category, setCategory] = useState<WaypointCategory>(waypoint?.category ?? 'general')
  const [color, setColor] = useState<WaypointColor>(waypoint?.color ?? DEFAULT_COLOR)
  const [notes, setNotes] = useState(waypoint?.notes ?? '')
  const [openedFor, setOpenedFor] = useState(editingId)

  // Re-seed the draft when a different waypoint is opened (including the
  // very first open) — but not on every store update, or edits in
  // progress would be clobbered by the store's own last-saved values.
  if (openedFor !== editingId) {
    setOpenedFor(editingId)
    setName(waypoint?.name ?? '')
    setCategory(waypoint?.category ?? 'general')
    setColor(waypoint?.color ?? DEFAULT_COLOR)
    setNotes(waypoint?.notes ?? '')
  }

  if (!editingId || !waypoint) return null

  function handleSave() {
    if (!editingId) return
    void updateWaypoint(editingId, { name: name.trim() || 'Waypoint', category, color, notes })
    closeEdit()
  }

  function handleDelete() {
    if (!editingId) return
    void deleteWaypoint(editingId)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="border-surface-600 bg-surface-900 max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-lg border p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-ink-100 text-sm font-semibold">Waypoint</h2>
          <button
            type="button"
            onClick={closeEdit}
            aria-label="Close without saving"
            className="text-ink-500 hover:text-ink-100"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-ink-500 text-xs font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:outline-2"
            />
          </label>

          <div>
            <span className="text-ink-500 text-xs font-medium">Category</span>
            <div
              role="radiogroup"
              aria-label="Category"
              className="mt-1.5 grid grid-cols-4 gap-1.5"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={category === option.value}
                  title={option.label}
                  onClick={() => setCategory(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md px-1 py-2 text-center transition-colors',
                    category === option.value
                      ? 'bg-brand-500/15 text-brand-400'
                      : 'text-ink-300 hover:bg-surface-800',
                  )}
                >
                  <option.Icon size={16} aria-hidden="true" />
                  <span className="text-[10px] leading-tight">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-ink-500 text-xs font-medium">Color</span>
            <div role="radiogroup" aria-label="Color" className="mt-1.5 flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={color === option.value}
                  title={option.label}
                  aria-label={option.label}
                  onClick={() => setColor(option.value)}
                  style={{ background: option.value }}
                  className={cn(
                    'h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--color-surface-900)] transition-shadow',
                    color === option.value ? 'ring-2 ring-white' : '',
                  )}
                />
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-500 text-xs font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:outline-2"
            />
          </label>

          <WaypointPhotos waypointId={editingId} photoIds={waypoint.photoIds ?? []} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 size={14} aria-hidden="true" />
            Delete
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            <Save size={14} aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
