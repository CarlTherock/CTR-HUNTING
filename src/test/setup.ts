import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Ensure each test starts from a clean DOM.
afterEach(() => {
  cleanup()
})

// jsdom does not implement matchMedia; several components (responsive
// layout, dark-mode aware widgets) rely on it, so provide a minimal stub.
function noop() {
  /* jsdom stub — no-op */
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
