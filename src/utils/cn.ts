type ClassValue = string | number | false | null | undefined | Record<string, boolean>

/**
 * Small conditional-classname joiner. Kept in-house instead of pulling in
 * `clsx`/`tailwind-merge` — the project rule is to avoid unnecessary
 * dependencies, and this covers every case the design system needs so far.
 */
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = []
  for (const input of inputs) {
    if (!input) continue
    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input))
      continue
    }
    for (const [key, value] of Object.entries(input)) {
      if (value) classes.push(key)
    }
  }
  return classes.join(' ')
}
