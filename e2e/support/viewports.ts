/** The viewports the mobile/tablet/desktop acceptance criteria require. */
export interface ViewportCase {
  name: string
  width: number
  height: number
  mobile: boolean
}

export const VIEWPORTS: readonly ViewportCase[] = [
  { name: '320x568', width: 320, height: 568, mobile: true },
  { name: '375x812', width: 375, height: 812, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '430x932', width: 430, height: 932, mobile: true },
  { name: '844x390 (paysage)', width: 844, height: 390, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: true },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
]
