import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './Card'

/** A titled card of explanatory text (help, privacy, about pages). `id` makes
 * the section a target for links such as `/help#limites-gps`. */
export function InfoSection({
  id,
  title,
  description,
  children,
}: {
  id?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="text-ink-300 flex flex-col gap-3 text-sm">
        {children}
      </CardContent>
    </Card>
  )
}
