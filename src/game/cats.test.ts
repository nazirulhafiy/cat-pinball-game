import { describe, expect, it } from 'vitest';
import { CAT_IDS, CAT_PROFILES, catPartAssetPaths, catPartTextureKeys } from './cats';

describe('cat cosmetic parts', () => {
  it('maps every cat type to its public name', () => {
    expect(Object.fromEntries(CAT_IDS.map((id) => [id, CAT_PROFILES[id].name]))).toEqual({
      calico: 'Tompok',
      tuxedo: 'Kicap',
      orange: 'Oyen',
      tabby: 'Belang',
      white: 'Kapas',
    });
  });

  it('defines matching paw and tail styling for every selectable cat', () => {
    for (const id of CAT_IDS) {
      expect(catPartTextureKeys(id)).toEqual({
        leftPaw: `paw-left-${id}`,
        rightPaw: `paw-right-${id}`,
        tail: `tail-launcher-${id}`,
      });
      expect(catPartAssetPaths(id)).toEqual({
        paw: `/balls/assets/cats/${id}/paw-flipper-v4.png`,
        tail: `/balls/assets/cats/${id}/tail-launcher-v4.png`,
      });
    }
  });
});
