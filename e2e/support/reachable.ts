import { expect, type ElementHandle, type Page } from '@playwright/test'

interface Box {
  name: string
  x: number
  y: number
  w: number
  h: number
}

/** Every named control is visible, fully on screen, not covered by another
 * element, and does not overlap the others. All rectangles are read in ONE
 * browser evaluation so a layout shift between two reads cannot fake an overlap. */
export async function expectReachable(page: Page, names: (string | RegExp)[]) {
  const handles: { name: string; el: ElementHandle<HTMLElement | SVGElement> }[] = []
  for (const name of names) {
    const button = page
      .getByRole('button', { name, exact: typeof name === 'string' })
      .first()
    await expect(button).toBeVisible()
    const el = await button.elementHandle()
    if (!el) throw new Error(`élément introuvable : ${String(name)}`)
    handles.push({ name: String(name), el })
  }
  const measured = await page.evaluate((entries) => {
    return entries.map(({ name, el }) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return {
        name,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        hit: !!top && (el === top || el.contains(top)),
        inside:
          r.left >= -0.5 &&
          r.top >= -0.5 &&
          r.right <= window.innerWidth + 0.5 &&
          r.bottom <= window.innerHeight + 0.5,
      }
    })
  }, handles)
  for (const m of measured) {
    expect(m.inside, `${m.name} dépasse de l’écran`).toBe(true)
    expect(m.hit, `${m.name} est recouvert`).toBe(true)
  }
  const boxes: Box[] = measured
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap =
        a.x < b.x + b.w - 1 &&
        b.x < a.x + a.w - 1 &&
        a.y < b.y + b.h - 1 &&
        b.y < a.y + a.h - 1
      expect(
        overlap,
        `${a.name} ${JSON.stringify([a.x, a.y, a.w, a.h].map(Math.round))} chevauche ${b.name} ${JSON.stringify([b.x, b.y, b.w, b.h].map(Math.round))}`,
      ).toBe(false)
    }
  }
}
