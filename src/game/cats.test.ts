import { describe, expect, it } from 'vitest';
import { asset } from './asset';
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
      const paw = `${import.meta.env.BASE_URL}assets/cats/${id}/paw-flipper-v4.png`;
      const tail = `${import.meta.env.BASE_URL}assets/cats/${id}/tail-launcher-v4.png`;
      expect(catPartAssetPaths(id)).toEqual({ paw, tail });
      expect(asset(`/balls/assets/cats/${id}/paw-flipper-v4.png`)).toBe(paw);
    }
  });
});
