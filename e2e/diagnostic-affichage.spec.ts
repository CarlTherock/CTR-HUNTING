import { expect, test } from './support/test'

/**
 * Diagnostic d'affichage (À propos) : Chromium seulement. Les valeurs sont
 * celles d'un navigateur de test, PAS d'un iPhone : on vérifie que le rapport
 * se produit, qu'il est cohérent avec la fenêtre et que les repères de bord
 * s'affichent puis se ferment.
 */
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })

test('le diagnostic mesure les hauteurs CSS et les repères de bord s’affichent', async ({
  page,
  backend,
}) => {
  void backend
  await page.goto('about')
  await page.getByRole('button', { name: 'Afficher le diagnostic' }).click()
  const report = page.getByTestId('display-diagnostic')
  await expect(report).toContainText('Hauteurs CSS résolues')
  const text = (await report.textContent()) ?? ''
  const inner = Number(/innerHeight : \d+ × (\d+)/.exec(text)?.[1])
  const dvh = Number(/100dvh ([\d.]+)/.exec(text)?.[1])
  expect(inner).toBe(852)
  expect(dvh).toBe(inner)
  expect(text).toMatch(/barre d’état « black-translucent »/)

  await page.getByRole('button', { name: /Afficher les repères de bord/ }).click()
  const overlay = page.getByTestId('edge-paint-test')
  await expect(overlay).toBeVisible()
  // Every marker block is drawn, A at the very bottom edge of the viewport.
  const bottoms = await overlay.evaluate((root) =>
    [...root.querySelectorAll('[data-marker]')].map((m) => ({
      letter: m.getAttribute('data-marker'),
      bottom: Math.round(
        (m.firstElementChild as HTMLElement).getBoundingClientRect().bottom,
      ),
    })),
  )
  expect(bottoms.find((b) => b.letter === 'A')?.bottom).toBe(852)
  expect(bottoms.find((b) => b.letter === 'E')?.bottom).toBe(852)
  await page.getByRole('button', { name: 'Fermer les repères' }).click()
  await expect(overlay).toBeHidden()
})
