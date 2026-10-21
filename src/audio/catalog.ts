// Lazy URLs. Nothing here is imported into the JS bundle — the bank
// fetches a file the first time the AudioContext is allowed to run.

export const STEMS = ['guitar', 'banjo', 'fiddle', 'harmonica', 'pad', 'percussion'] as const;
export type StemName = (typeof STEMS)[number];

export const MUSIC = {
  guitar: '/audio/music/stem-guitar.ogg',
  banjo: '/audio/music/stem-banjo.ogg',
  fiddle: '/audio/music/stem-fiddle.ogg',
  harmonica: '/audio/music/stem-harmonica.ogg',
  pad: '/audio/music/stem-pad.ogg',
  percussion: '/audio/music/stem-percussion.ogg',
  stingerFlake: '/audio/music/stinger-flake.ogg',
  stingerNugget: '/audio/music/stinger-nugget.ogg',
  stingerSale: '/audio/music/stinger-sale.ogg',
} as const;

export const AMBIENCE = {
  creek: '/audio/ambience/creek.ogg',
  creekClose: '/audio/ambience/creek-close.ogg',
  wind: '/audio/ambience/wind.ogg',
  rain: '/audio/ambience/rain.ogg',
  crickets: '/audio/ambience/crickets.ogg',
  town: '/audio/ambience/town.ogg',
  owl: ['/audio/ambience/owl-a.ogg', '/audio/ambience/owl-b.ogg'],
  bird: [
    '/audio/ambience/bird-a.ogg',
    '/audio/ambience/bird-b.ogg',
    '/audio/ambience/bird-c.ogg',
    '/audio/ambience/bird-d.ogg',
  ],
} as const;

export const SFX = {
  footGrass: [
    '/audio/sfx/foot-grass-0.ogg',
    '/audio/sfx/foot-grass-1.ogg',
    '/audio/sfx/foot-grass-2.ogg',
    '/audio/sfx/foot-grass-3.ogg',
    '/audio/sfx/foot-grass-4.ogg',
    '/audio/sfx/foot-grass-5.ogg',
    '/audio/sfx/foot-grass-6.ogg',
    '/audio/sfx/foot-grass-7.ogg',
  ],
  footDirt: [
    '/audio/sfx/foot-dirt-0.ogg',
    '/audio/sfx/foot-dirt-1.ogg',
    '/audio/sfx/foot-dirt-2.ogg',
  ],
  footGravel: [
    '/audio/sfx/foot-gravel-0.ogg',
    '/audio/sfx/foot-gravel-1.ogg',
    '/audio/sfx/foot-gravel-2.ogg',
    '/audio/sfx/foot-gravel-3.ogg',
  ],
  footWood: [
    '/audio/sfx/foot-wood-0.ogg',
    '/audio/sfx/foot-wood-1.ogg',
    '/audio/sfx/foot-wood-2.ogg',
    '/audio/sfx/foot-wood-3.ogg',
  ],
  footWater: [
    '/audio/sfx/foot-water-0.ogg',
    '/audio/sfx/foot-water-1.ogg',
    '/audio/sfx/foot-water-2.ogg',
    '/audio/sfx/foot-water-3.ogg',
  ],
  dig: [
    '/audio/sfx/dig-0.ogg',
    '/audio/sfx/dig-1.ogg',
    '/audio/sfx/dig-2.ogg',
    '/audio/sfx/dig-3.ogg',
  ],
  dirt: ['/audio/sfx/dirt-crunch.ogg'],
  slosh: ['/audio/sfx/slosh.ogg', '/audio/sfx/slosh-1.ogg', '/audio/sfx/slosh-2.ogg'],
  gold: [
    '/audio/sfx/gold-0.ogg',
    '/audio/sfx/gold-1.ogg',
    '/audio/sfx/gold-2.ogg',
    '/audio/sfx/gold-3.ogg',
  ],
  jump: ['/audio/sfx/jump.ogg'],
  land: ['/audio/sfx/land.ogg'],
  coins: ['/audio/sfx/coins.ogg', '/audio/sfx/coins-b.ogg'],
  uiClick: ['/audio/sfx/ui-click.ogg'],
  uiHover: ['/audio/sfx/ui-hover.ogg'],
  uiOpen: ['/audio/sfx/ui-open.ogg'],
  uiClose: ['/audio/sfx/ui-close.ogg'],
  uiConfirm: ['/audio/sfx/ui-confirm.ogg'],
  uiPluck: ['/audio/sfx/ui-pluck.ogg'],
} as const;

export const IMPULSE = '/audio/ir/mine.ogg';

export type MusicCue = 'exploration' | 'prospecting' | 'town' | 'night';
export type Attention = 'world' | 'menu' | 'dialogue';

export function allAudioUrls(): string[] {
  const urls: string[] = [...Object.values(MUSIC), IMPULSE];
  urls.push(
    AMBIENCE.creek,
    AMBIENCE.creekClose,
    AMBIENCE.wind,
    AMBIENCE.rain,
    AMBIENCE.crickets,
    AMBIENCE.town,
  );
  urls.push(...AMBIENCE.owl, ...AMBIENCE.bird);
  for (const group of Object.values(SFX)) urls.push(...group);
  return urls;
}
