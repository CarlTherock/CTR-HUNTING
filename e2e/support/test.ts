import { test as base, expect } from '@playwright/test'
import { installMockMapBackend, type MockMapBackend } from './mockMapBackend'

interface Fixtures {
  /** Simulated MapTiler/Esri backend; see `mockMapBackend.ts`. */
  backend: MockMapBackend
}

export const test = base.extend<Fixtures>({
  backend: async ({ context }, use) => {
    await use(await installMockMapBackend(context))
  },
})

export { expect }
