import { CameraSheet } from './CameraSheet'
import { CAMERA_HELP_POINTS, CAMERA_WARNING } from './bloodHighlight'

/** The full caution text. The short mention over the image opens this. */
export function CameraHelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <CameraSheet
      label="Aide et informations sur la caméra de sang"
      title="Aide et informations"
      onClose={onClose}
      testId="camera-help"
    >
      <p
        className="text-sm font-semibold text-amber-300"
        data-testid="camera-help-warning"
      >
        {CAMERA_WARNING}
      </p>
      <ul className="text-ink-100 flex list-disc flex-col gap-2 pl-5 text-sm">
        {CAMERA_HELP_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p className="text-ink-300 text-xs">
        Fonction expérimentale. Filtrée : l’image avec les zones candidates surlignées.
        Originale : l’image brute. Comparaison : les deux de part et d’autre d’un
        séparateur que vous déplacez. La couleur de surbrillance (Paramètres) ne change
        que l’affichage, pas les zones détectées.
      </p>
    </CameraSheet>
  )
}
