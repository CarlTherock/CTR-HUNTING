import type { ShotSpecies } from '@/types'
import type { Illustration } from '../types'
import { DEER_ILLUSTRATION } from './deer'
import { MOOSE_ILLUSTRATION } from './moose'

export const ILLUSTRATIONS: Record<ShotSpecies, Illustration> = {
  deer: DEER_ILLUSTRATION,
  moose: MOOSE_ILLUSTRATION,
}
