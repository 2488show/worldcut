// The animals that can become pets: what they look like and the colours they come in. Shared by
// the models (drawn once for every species and colour) and the game (which species live where,
// what they eat, what they bring).

import { $t } from '../i18n'
export type RGB3 = [number, number, number]
export interface PetColour { id: string; name: string; main: RGB3; dark: RGB3; light: RGB3; weight: number }
export interface PetShape { W: number; L: number; H: number; kind: 'rabbit' | 'chicken' | 'sheep' | 'goat' | 'dog' | 'cat' | 'fox' }

const c = (id: string, name: string, main: RGB3, weight: number, dark?: RGB3, light?: RGB3): PetColour => ({
  id, name, main, weight,
  dark: dark ?? [main[0] * 0.72, main[1] * 0.72, main[2] * 0.72],
  light: light ?? [Math.min(255, main[0] * 1.12 + 14), Math.min(255, main[1] * 1.12 + 14), Math.min(255, main[2] * 1.12 + 14)],
})

export const PET_SPECIES: Record<string, { name: string; shape: PetShape; colours: PetColour[] }> = {
  rabbit: {
    name: $t('兔子'), shape: { W: 5, L: 7, H: 7, kind: 'rabbit' },
    colours: [c('white', $t('白'), [246, 244, 238], 45), c('brown', $t('棕'), [160, 112, 74], 35), c('grey', $t('灰'), [150, 150, 160], 14), c('black', $t('黑'), [60, 56, 64], 5), c('pink', $t('粉'), [250, 186, 206], 1)],
  },
  chicken: {
    name: $t('鸡'), shape: { W: 5, L: 6, H: 7, kind: 'chicken' },
    colours: [c('white', $t('白'), [250, 248, 240], 60), c('brown', $t('棕'), [176, 112, 60], 32), c('black', $t('黑'), [56, 54, 62], 7), c('gold', $t('金'), [240, 196, 70], 1)],
  },
  sheep: {
    name: $t('绵羊'), shape: { W: 7, L: 9, H: 7, kind: 'sheep' },
    colours: [c('white', $t('白'), [244, 242, 232], 60), c('cream', $t('奶油'), [236, 214, 170], 20), c('black', $t('黑'), [64, 60, 70], 14), c('brown', $t('棕'), [150, 106, 72], 5), c('pink', $t('粉'), [250, 180, 204], 1)],
  },
  goat: {
    name: $t('山羊'), shape: { W: 5, L: 9, H: 8, kind: 'goat' },
    colours: [c('white', $t('白'), [240, 236, 226], 50), c('brown', $t('棕'), [150, 104, 70], 30), c('black', $t('黑'), [60, 56, 62], 15), c('gold', $t('金'), [226, 182, 80], 5)],
  },
  dog: {
    name: $t('狗'), shape: { W: 5, L: 9, H: 7, kind: 'dog' },
    colours: [c('tan', $t('黄'), [214, 160, 92], 50), c('black', $t('黑'), [56, 52, 58], 25), c('white', $t('白'), [244, 240, 232], 15), c('grey', $t('灰'), [140, 144, 154], 8), c('blue', $t('蓝'), [110, 150, 230], 2)],
  },
  cat: {
    name: $t('猫'), shape: { W: 5, L: 8, H: 6, kind: 'cat' },
    colours: [c('orange', $t('橘'), [236, 150, 70], 40), c('grey', $t('灰'), [140, 140, 150], 25), c('white', $t('白'), [246, 244, 240], 20), c('black', $t('黑'), [50, 48, 56], 13), c('lilac', $t('紫'), [186, 150, 226], 2)],
  },
  fox: {
    name: $t('狐狸'), shape: { W: 5, L: 10, H: 6, kind: 'fox' },
    colours: [c('red', $t('赤'), [226, 120, 50], 70), c('arctic', $t('雪白'), [240, 244, 248], 25), c('silver', $t('银'), [170, 176, 196], 5)],
  },
}
export const PET_ORDER = Object.keys(PET_SPECIES)
export const petModel = (sp: string, col: string, walk = false) => `p_${sp}_${col}${walk ? '_w' : ''}`
