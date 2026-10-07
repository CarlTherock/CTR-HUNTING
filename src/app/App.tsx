import { useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { Splash } from '@/components/layout'
import { isStandalonePwa } from '@/utils/pwa'

export function App() {
  const [showSplash, setShowSplash] = useState(isStandalonePwa)

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
    </>
  )
}
