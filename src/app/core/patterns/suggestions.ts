/**
 * Suggestions de départ pour un panneau : chaque suggestion est le projet complet qu'on obtiendrait
 * en l'appliquant. Rien n'est appliqué tant que l'utilisateur ne l'a pas choisi.
 */
import { clamp } from '../geometry/geometry';
import { Project } from '../model/project';
import { generatePattern, insertPattern, PatternOptions } from './patterns';

export interface Suggestion {
  id: string;
  label: string;
  /** Une phrase : ce que ça donne sur le panneau. */
  hint: string;
  result: Project;
}

/** Les trous et réglages du projet sont gardés ; les formes sont remplacées. */
export function suggestionsFor(p: Project): Suggestion[] {
  const { w, h } = p.panel;
  const small = Math.min(w, h);
  const landscape = w > h * 1.2;
  const withPattern = (o: Omit<PatternOptions, 'count'> & { count: number }): Project => ({
    ...p,
    zones: insertPattern(p.zones, generatePattern(o, p.panel, 1), true),
  });
  const withBg = (color: Project['bg']['color'], angle: number): Project => ({
    ...p,
    bg: { mode: 'paille', color, angle },
    zones: p.zones.filter((z) => z.hole),
  });
  const rays = small < 160 ? 8 : small < 400 ? 12 : 16;
  const bands = clamp(Math.round((landscape ? w : h) / Math.max(25, small / 4)), 4, 16);
  const cells = clamp(Math.round(small / 45), 2, 8);
  return [
    {
      id: 'uni',
      label: 'Paille unie',
      hint: 'Tout le panneau en paille naturelle, fil dans la longueur.',
      result: withBg('naturel', w >= h ? 0 : 90),
    },
    {
      id: 'biais',
      label: 'Paille en biais',
      hint: 'Une seule couleur, fil à 45° : les reflets glissent en diagonale.',
      result: withBg('miel', 45),
    },
    {
      id: 'soleil-bas',
      label: 'Soleil levant',
      hint: `${rays} rayons depuis le bas, chacun avec le fil dans son axe.`,
      result: withPattern({ type: 'soleil', count: rays, option: 'bas', colorA: 'naturel', colorB: 'ble', angleA: 0, angleB: 0 }),
    },
    {
      id: 'soleil-centre',
      label: 'Soleil centré',
      hint: `${rays + 4} rayons autour du centre.`,
      result: withPattern({ type: 'soleil', count: rays + 4, option: 'centre', colorA: 'miel', colorB: 'ble', angleA: 0, angleB: 0 }),
    },
    {
      id: 'chevron',
      label: 'Chevrons',
      hint: `${bands} bandes à 45° et 135°, en deux pailles.`,
      result: withPattern({ type: 'bandes', count: bands, option: landscape ? 'v' : 'h', colorA: 'naturel', colorB: 'ble', angleA: 45, angleB: 135 }),
    },
    {
      id: 'damier-lumiere',
      label: 'Damier de lumière',
      hint: "Une seule paille, fil à 0° et 90° : le damier n'apparaît que par les reflets.",
      result: withPattern({ type: 'damier', count: cells, colorA: 'naturel', colorB: 'naturel', angleA: 0, angleB: 90 }),
    },
    {
      id: 'losanges',
      label: 'Losanges',
      hint: 'Deux familles de losanges, deux pailles contrastées.',
      result: withPattern({ type: 'losanges', count: clamp(Math.round(small / 70), 2, 7), colorA: 'ble', colorB: 'brule', angleA: 45, angleB: 135 }),
    },
  ];
}
