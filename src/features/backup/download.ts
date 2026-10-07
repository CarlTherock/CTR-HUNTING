import type { ShareOutcome } from '@/services/share'

/**
 * Saving a generated file. Object URLs are tracked and revoked (after the
 * browser had time to start the download, and on `revokeAllDownloadUrls`
 * when the screen unmounts) so a big backup is not kept in memory forever.
 *
 * iOS note (Safari and the installed PWA): `<a download>` on a blob URL is
 * honoured by recent Safari (the file lands in « Téléchargements » of the
 * Files app), but the home-screen PWA may ignore the download attribute or
 * need a fresh tap. That is why the UI always keeps explicit buttons —
 * « Télécharger » and « Partager / Enregistrer dans Fichiers » (share sheet,
 * iOS 15+) — usable straight from a tap after the file is built.
 */
const liveUrls = new Set<string>()

export function downloadBlob(blob: Blob, fileName: string, revokeAfterMs = 60_000): void {
  const url = URL.createObjectURL(blob)
  liveUrls.add(url)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => revoke(url), revokeAfterMs)
}

function revoke(url: string): void {
  if (liveUrls.delete(url)) URL.revokeObjectURL(url)
}

export function revokeAllDownloadUrls(): void {
  for (const url of [...liveUrls]) revoke(url)
}

export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  if (!canShareFile(file)) return 'unsupported'
  try {
    await navigator.share({ files: [file], title })
    return 'shared'
  } catch (error) {
    if ((error as { name?: unknown })?.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}
