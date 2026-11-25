import { Zone } from '../model/project';
import {
  arcLength,
  bbox,
  edgeInfo,
  isNarrow,
  labelPoint,
  normAngle,
  offsetPolygon,
  panelPolygon,
  perimeter,
  pickAt,
  pointInPolygon,
  prepare,
  profileRadius,
  profileSteps,
  rng,
  signedArea,
  topAt,
  zonePolygon,
} from './geometry';

const zone = (o: Partial<Zone>): Zone => ({
  id: 1, type: 'rect', name: 'z', x: 50, y: 50, w: 20, h: 10, rot: 0, color: 'naturel', angle: 0, hole: false, ...o,
});

describe('géométrie', () => {
  it('construit le polygone monde : unitaires × (w, h), rotation, translation', () => {
    const p = zonePolygon(zone({ rot: 90 }));
    expect(p).toHaveLength(4);
    const [x0, y0, x1, y1] = bbox(p);
    expect(x1 - x0).toBeCloseTo(10);
    expect(y1 - y0).toBeCloseTo(20);
    expect((x0 + x1) / 2).toBeCloseTo(50);
  });

  it("approche l'ellipse par 72 points", () => {
    expect(zonePolygon(zone({ type: 'ellipse' }))).toHaveLength(72);
  });

  it('calcule aire, périmètre et appartenance', () => {
    const sq = panelPolygon({ w: 10, h: 10 });
    expect(Math.abs(signedArea(sq))).toBe(100);
    expect(perimeter(sq)).toBe(40);
    expect(pointInPolygon(sq, 5, 5)).toBe(true);
    expect(pointInPolygon(sq, 11, 5)).toBe(false);
  });

  it('applique les trous après toutes les zones, quel que soit leur rang', () => {
    const hole = zone({ id: 1, hole: true, w: 4, h: 4 });
    const top = zone({ id: 2 });
    const D = prepare([hole, top]);
    expect(topAt(D, 50, 50)).toBe('hole');
    expect(topAt(D, 58, 50)).toBe(top);
    expect(topAt(D, 0, 0)).toBeNull();
  });

  it('peintre classique : la dernière zone passe devant', () => {
    const a = zone({ id: 1 });
    const b = zone({ id: 2 });
    expect(topAt(prepare([a, b]), 50, 50)).toBe(b);
  });

  it('ignore les clics hors du panneau (secteurs qui débordent)', () => {
    const big = zone({ x: 0, y: 0, w: 1000, h: 1000 });
    const D = prepare([big]);
    expect(pickAt(D, { w: 100, h: 100 }, 50, 50)).toBe(big);
    expect(pickAt(D, { w: 100, h: 100 }, -10, 50)).toBeNull();
  });

  it('pose le numéro sur un point réellement visible', () => {
    const under = zone({ id: 1, x: 50, y: 50, w: 40, h: 20 });
    const cover = zone({ id: 2, x: 50, y: 50, w: 20, h: 20 });
    const D = prepare([under, cover]);
    const o = D.zones[0]!;
    const p = labelPoint(D, o, { w: 100, h: 100 });
    expect(p).not.toBeNull();
    expect(topAt(D, p![0], p![1])).toBe(under);
  });

  it('signale les zones de moins de 3 brins', () => {
    expect(isNarrow(zone({ w: 11, h: 50 }), 4)).toBe(true);
    expect(isNarrow(zone({ w: 12, h: 50 }), 4)).toBe(false);
    expect(isNarrow(zone({ w: 1, h: 1, hole: true }), 4)).toBe(false);
    expect(isNarrow(zone({ type: 'poly', w: 1, h: 1, pts: [[0, 0], [1, 0], [0, 1]] }), 4)).toBe(false);
  });

  it('prend les angles de fil modulo 180', () => {
    expect(normAngle(180)).toBe(0);
    expect(normAngle(-45)).toBe(135);
    expect(normAngle(225)).toBe(45);
  });

  it('borne le rayon de profil par l’épaisseur', () => {
    expect(profileRadius({ type: 'arrondi', size: 10 }, 6)).toBe(5.5);
    expect(profileRadius({ type: 'droit', size: 10 }, 18)).toBe(0);
    expect(arcLength({ type: 'arrondi', size: 4 }, 4)).toBeCloseTo(2 * Math.PI);
    expect(arcLength({ type: 'chanfrein', size: 4 }, 4)).toBeCloseTo(4 * Math.SQRT2);
  });

  it('échantillonne le profil de la façade (t = 0) à la paroi (t = 90°)', () => {
    const s = profileSteps({ type: 'arrondi', size: 4 }, 4);
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual({ d: 4, z: -0, t: 0 });
    expect(s[8]!.t).toBeCloseTo(Math.PI / 2);
    expect(s[8]!.d).toBeCloseTo(0);
    expect(s[8]!.z).toBeCloseTo(-4);
    expect(profileSteps({ type: 'chanfrein', size: 4 }, 4)).toHaveLength(2);
  });

  it('décale les contours vers la matière (panneau vers l’intérieur, trou vers l’extérieur)', () => {
    const sq = panelPolygon({ w: 100, h: 100 });
    const inner = offsetPolygon(sq, edgeInfo(sq, true), 5);
    expect(bbox(inner)).toEqual([5, 5, 95, 95].map((v) => expect.closeTo(v)));
    const hole: [number, number][] = [[40, 40], [60, 40], [60, 60], [40, 60]];
    const outer = offsetPolygon(hole, edgeInfo(hole, false), 5);
    expect(bbox(outer)).toEqual([35, 35, 65, 65].map((v) => expect.closeTo(v)));
  });

  it('borne l’onglet des angles aigus à 1/0,35', () => {
    const tri: [number, number][] = [[0, 0], [100, 0], [0, 5]];
    const I = edgeInfo(tri, true);
    for (const [, , f] of I.vm) expect(f).toBeLessThanOrEqual(1 / 0.35 + 1e-9);
  });

  it('génère une suite pseudo-aléatoire déterministe', () => {
    const a = rng(42);
    const b = rng(42);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    for (const x of xs) expect(x).toBeGreaterThan(0);
  });
});
