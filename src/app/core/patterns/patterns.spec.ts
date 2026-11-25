import { bbox, zonePolygon } from '../geometry/geometry';
import { Zone } from '../model/project';
import { generatePattern, insertPattern, PatternOptions } from './patterns';

const base: PatternOptions = { type: 'soleil', count: 12, option: 'bas', colorA: 'naturel', colorB: 'ble', angleA: 45, angleB: 135 };
const panel = { w: 400, h: 700 };

describe('motifs', () => {
  it('soleil : le fil de chaque rayon suit sa bissectrice', () => {
    const z = generatePattern(base, panel, 1);
    expect(z).toHaveLength(12);
    // origine en bas, demi-tour de 180° à 360° : bissectrice du 1er rayon = 187,5° → 7°/8° modulo 180
    expect(z[0]!.angle).toBe(Math.round(187.5 % 180) % 180);
    // rayon vertical au milieu
    expect(z[5]!.angle).toBe(Math.round((180 + 15 * 5 + 7.5) % 180));
    expect(z.every((r) => r.angle >= 0 && r.angle < 180)).toBe(true);
  });

  it('soleil : les secteurs débordent volontairement du panneau', () => {
    const z = generatePattern(base, panel, 1);
    const [x0] = bbox(zonePolygon(z[0]!));
    expect(x0).toBeLessThan(0);
  });

  it('alterne couleurs et sens, ids consécutifs', () => {
    const z = generatePattern({ ...base, type: 'bandes', count: 4, option: 'h' }, panel, 10);
    expect(z.map((b) => b.id)).toEqual([10, 11, 12, 13]);
    expect(z.map((b) => b.color)).toEqual(['naturel', 'ble', 'naturel', 'ble']);
    expect(z.map((b) => b.angle)).toEqual([45, 135, 45, 135]);
    expect(z[0]).toMatchObject({ w: 400, h: 175, name: 'Bande 1' });
  });

  it('borne le nombre selon le motif', () => {
    expect(generatePattern({ ...base, type: 'damier', count: 100 }, { w: 100, h: 100 }, 1)).toHaveLength(16 * 16);
    expect(generatePattern({ ...base, count: 1 }, panel, 1)).toHaveLength(3);
  });

  it('losanges : deux familles imbriquées', () => {
    const z = generatePattern({ ...base, type: 'losanges', count: 2 }, { w: 100, h: 100 }, 1);
    expect(z.filter((d) => d.color === 'naturel')).toHaveLength(9);
    expect(z.filter((d) => d.color === 'ble')).toHaveLength(4);
  });

  it('garde les trous en fin de liste', () => {
    const hole = { id: 1, hole: true } as Zone;
    const shape = { id: 2, hole: false } as Zone;
    const pat = [{ id: 3, hole: false } as Zone];
    expect(insertPattern([hole, shape], pat, true).map((z) => z.id)).toEqual([3, 1]);
    expect(insertPattern([hole, shape], pat, false).map((z) => z.id)).toEqual([2, 3, 1]);
  });
});
