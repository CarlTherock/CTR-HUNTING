interface NodeProcessLike {
  on(event: 'unhandledRejection', handler: (reason: unknown) => void): void
  off(event: 'unhandledRejection', handler: (reason: unknown) => void): void
}

// Vitest runs in Node, but this project's tsconfig deliberately has no
// Node typings; only the two methods used here are described.
const nodeProcess = (globalThis as unknown as { process: NodeProcessLike }).process

/** Collects `unhandledRejection`s raised while a test runs, so a test can
 * assert that a failing async call was handled rather than left dangling.
 * Call `settle()` to let the event loop turn, then `stop()`. */
export function trackUnhandledRejections() {
  const reasons: unknown[] = []
  const handler = (reason: unknown) => {
    reasons.push(reason)
  }
  nodeProcess.on('unhandledRejection', handler)
  return {
    reasons,
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 20))
    },
    stop() {
      nodeProcess.off('unhandledRejection', handler)
    },
  }
}
