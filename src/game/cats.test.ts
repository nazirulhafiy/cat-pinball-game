import { describe, expect, it } from 'vitest';
import { CAT_IDS, catPartAssetPaths, catPartTextureKeys } from './cats';

describe('cat cosmetic parts', () => {
  it('defines matching paw and tail styling for every selectable cat', () => {
    for (const id of CAT_IDS) {
      expect(catPartTextureKeys(id)).toEqual({
        leftPaw: `paw-left-${id}`,
        rightPaw: `paw-right-${id}`,
        tail: `tail-launcher-${id}`,
      });
      expect(catPartAssetPaths(id)).toEqual({
        paw: `/assets/cats/${id}/paw-flipper-v4.png`,
        tail: `/assets/cats/${id}/tail-launcher-v4.png`,
      });
    }
  });
});
