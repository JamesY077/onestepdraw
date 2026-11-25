import type { ImageModelModule } from '../types'
import { doubaoSeedream50LiteModel } from './doubaoSeedream50Lite'
import { mossImageSftModel } from './mossImage'
import { minimaxH3ImageHighspeedModel, minimaxH3ImageModel } from './minimaxH3Image'

export { doubaoSeedream50LiteModel } from './doubaoSeedream50Lite'
export { mossImageSftModel } from './mossImage'
export { minimaxH3ImageHighspeedModel, minimaxH3ImageModel } from './minimaxH3Image'

export const imageModelModules: ImageModelModule[] = [
  doubaoSeedream50LiteModel,
  minimaxH3ImageModel,
  minimaxH3ImageHighspeedModel,
  mossImageSftModel,
]
