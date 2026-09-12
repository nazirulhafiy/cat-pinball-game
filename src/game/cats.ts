import type { CatId, CatProfile } from './contracts';
import { asset } from './asset';

export const CAT_PROFILES: Record<CatId, CatProfile> = {
  calico: {
    id: 'calico',
    name: 'Tompok',
    title: 'Calico Charmer',
    description: 'Lucky, curious, and always ready to pounce.',
    primary: 0xf2b56b,
    secondary: 0xfff2d8,
    accent: 0x353340,
    cssPrimary: '#f2b56b',
    cssSecondary: '#fff2d8',
    cssAccent: '#353340',
  },
  tuxedo: {
    id: 'tuxedo',
    name: 'Kicap',
    title: 'Tuxedo Tactician',
    description: 'Precise, polished, and suspiciously confident.',
    primary: 0x252532,
    secondary: 0xf7f2e8,
    accent: 0x73d7ff,
    cssPrimary: '#252532',
    cssSecondary: '#f7f2e8',
    cssAccent: '#73d7ff',
  },
  orange: {
    id: 'orange',
    name: 'Oyen',
    title: 'Orange Menace',
    description: 'One brain cell. Infinite bumper enthusiasm.',
    primary: 0xf0843c,
    secondary: 0xffd18a,
    accent: 0xfff4c7,
    cssPrimary: '#f0843c',
    cssSecondary: '#ffd18a',
    cssAccent: '#fff4c7',
  },
  tabby: {
    id: 'tabby',
    name: 'Belang',
    title: 'Tabby Trailblazer',
    description: 'Steady paws make for legendary recoveries.',
    primary: 0x8d8176,
    secondary: 0xd6c8b9,
    accent: 0xb8f3c8,
    cssPrimary: '#8d8176',
    cssSecondary: '#d6c8b9',
    cssAccent: '#b8f3c8',
  },
  white: {
    id: 'white',
    name: 'Kapas',
    title: 'Moonbeam Zoomer',
    description: 'Quiet as moonlight until the 3 a.m. zoomies begin.',
    primary: 0xf7f4ea,
    secondary: 0xd8e6f2,
    accent: 0x5ea6d5,
    cssPrimary: '#f7f4ea',
    cssSecondary: '#d8e6f2',
    cssAccent: '#5ea6d5',
  },
};

export const CAT_IDS = Object.keys(CAT_PROFILES) as CatId[];

export function catPartTextureKeys(cat: CatId) {
  return {
    leftPaw: `paw-left-${cat}`,
    rightPaw: `paw-right-${cat}`,
    tail: `tail-launcher-${cat}`,
  } as const;
}

export function catPartAssetPaths(cat: CatId) {
  return {
    paw: asset(`/assets/cats/${cat}/paw-flipper-v4.png`),
    tail: asset(`/assets/cats/${cat}/tail-launcher-v4.png`),
  } as const;
}
