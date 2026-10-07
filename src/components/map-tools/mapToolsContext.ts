import { createContext } from 'react'

export interface MapToolsContextValue {
  railHost: HTMLElement | null
  sheetHost: HTMLElement | null
  closeSheet: () => void
}

export const MapToolsContext = createContext<MapToolsContextValue | null>(null)

export const MapToolsProvider = MapToolsContext.Provider

