import { useState } from 'react'
import { Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui'
import type { WaypointCategory } from '@/types'
import { useWaypointsStore } from '../state/waypointsStore'

const CATEGORY_OPTIONS: { value: WaypointCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'campsite', label: 'Campsite' },
  { value: 'water', label: 'Water' },
  { value: 'game_sign', label: 'Game sign' },
  { value: 'stand_blind', label: 'Stand / blind' },
  { value: 'trailhead', label: 'Trailhead' },
  { value: 'hazard', label: 'Hazard' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'custom', label: 'Custom' },
]

/** Bottom-sheet form for a waypoint's name/category/notes, opened either
 * right after placing a new one or by tapping an existing marker. Holds
 * its own draft state — edits only reach the store (and Dexie) on
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
  const [notes, setNotes] = useState(waypoint?.notes ?? '')
  const [openedFor, setOpenedFor] = useState(editingId)

  // Re-seed the draft when a different waypoint is opened (including the
  // very first open) — but not on every store update, or edits in
  // progress would be clobbered by the store's own last-saved values.
  if (openedFor !== editingId) {
    setOpenedFor(editingId)
    setName(waypoint?.name ?? '')
    setCategory(waypoint?.category ?? 'general')
    setNotes(waypoint?.notes ?? '')
  }

  if (!editingId || !waypoint) return null

  function handleSave() {
    if (!editingId) return
    void updateWaypoint(editingId, { name: name.trim() || 'Waypoint', category, notes })
    closeEdit()
  }

  function handleDelete() {
    if (!editingId) return
    void deleteWaypoint(editingId)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="border-surface-600 bg-surface-900 w-full max-w-sm rounded-lg border p-4 shadow-2xl">
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

          <label className="flex flex-col gap-1">
            <span className="text-ink-500 text-xs font-medium">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WaypointCategory)}
              className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:outline-2"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-ink-500 text-xs font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:outline-2"
            />
          </label>
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
