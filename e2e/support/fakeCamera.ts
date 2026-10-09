import type { Page } from '@playwright/test'

/** The red patch drawn in the fake frame, as fractions of the source size. */
export const PATCH = { x: 0.42, y: 0.4, w: 0.12, h: 0.2 } as const
/** Source colour of the patch (#b0171f) and of the background (#556b2f). */
export const PATCH_RGB = [176, 23, 31] as const
export const BACKGROUND_RGB = [85, 107, 47] as const

export interface FakeCameraOptions {
  width?: number
  height?: number
  /** `true`: the track reports a torch and accepts the constraint. `'refuse'`:
   * it reports one but the device rejects it. `false`: no torch capability. */
  torch?: boolean | 'refuse'
}

/**
 * Replaces `getUserMedia` with a canvas stream of known size and content, so
 * the live layout and the crop can be measured. SIMULATED: this is not a real
 * camera, and says nothing about iOS Safari's video behaviour.
 */
export async function installFakeCamera(page: Page, options: FakeCameraOptions = {}) {
  await page.addInitScript(
    (opts) => {
      const width = opts.width ?? 1280
      const height = opts.height ?? 720
      const patch = opts.patch
      const w = window as unknown as {
        __cameraTracks: MediaStreamTrack[]
        __torch: boolean[]
      }
      w.__cameraTracks = []
      w.__torch = []
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        let tick = 0
        const draw = () => {
          if (!ctx) return
          ctx.fillStyle = '#556b2f'
          ctx.fillRect(0, 0, width, height)
          // A red patch near the centre (it stays visible after the cover crop of
          // a tall screen) and a white frame at the edges, so a crop or a shift
          // is visible in pixels.
          ctx.fillStyle = '#b0171f'
          ctx.fillRect(
            width * patch.x,
            height * patch.y,
            width * patch.w,
            height * patch.h,
          )
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 8
          ctx.strokeRect(4, 4, width - 8, height - 8)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(width - 40 - (tick % 2), 20, 20, 20)
          tick += 1
        }
        draw()
        setInterval(draw, 100)
        const stream = canvas.captureStream(10)
        const [track] = stream.getVideoTracks()
        if (track) {
          w.__cameraTracks.push(track)
          if (opts.torch) {
            track.getCapabilities = () => ({ torch: true }) as MediaTrackCapabilities
            track.applyConstraints = async (constraints) => {
              if (opts.torch === 'refuse')
                throw new DOMException('no torch', 'NotSupportedError')
              const advanced = constraints?.advanced as { torch?: boolean }[] | undefined
              const first = advanced?.[0]
              if (first && typeof first.torch === 'boolean') w.__torch.push(first.torch)
            }
          }
        }
        return stream
      }
    },
    { ...options, patch: PATCH },
  )
}
