import { normalizeProject } from '../model/normalize';
import { defaultFill, Point, Zone } from '../model/project';
import { angularSpan, chevronPieces, distRange, fanPieces, fillCenter, toZoneLocal, zoneFillPieces } from './fill';
import { zonePolygon } from './geometry';

const zone = (o: Partial<Zone>): Zone => ({
  id: 1, type: 'rect', name: 'z', x: 100, y: 100, w: 100, h: 50, rot: 0, color: 'naturel', angle: 30, hole: false, ...o,
});

describe('dispositions des brins', () => {
  it("l'origine suit déplacement, taille et rotation de la forme", () => {
    const z = zone({ rot: 90, fill: defaultFill('eventail') });
    // bas de la forme (cy = 0,5) tourné de 90° : passe à gauche
    const c = fillCenter(z);
    expect(c[0]).toBeCloseTo(75);
    expect(c[1]).toBeCloseTo(100);
    const back = toZoneLocal(z, c);
    expect(back[0]).toBeCloseTo(0);
    expect(back[1]).toBeCloseTo(0.5);
  });

  it('secteur angulaire et distances vus du point', () => {
    expect(angularSpan([5, 5], [0, 0, 10, 10])).toEqual([0, 2 * Math.PI]);
    const [a0, a1] = angularSpan([50, 120], [0, 0, 100, 100]);
    expect(a1 - a0).toBeLessThan(Math.PI);
    expect(distRange([50, 120], [0, 0, 100, 100])).toEqual([20, expect.closeTo(Math.hypot(50, 120))]);
  });

  it('éventail : le fil de chaque brin suit son rayon, largeur ≤ sw au plus loin', () => {
    const c: Point = [50, 110];
    const pieces = fanPieces(c, [0, 0, 100, 100], 4, 1);
    expect(pieces.length).toBeGreaterThan(20);
    for (const p of pieces) {
      expect(p.solid).toBe(true);
      const [a, b] = p.axis as [Point, Point];
      const ray = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 180;
      expect(p.angle).toBeCloseTo(ray, 5);
    }
    // le rayon vertical (vers le haut) a un fil à 90°
    expect(pieces.some((p) => Math.abs(p.angle - 90) < 2)).toBe(true);
  });

  it('chevron : le fil alterne de ± ouverture autour de l’axe', () => {
    const pieces = chevronPieces([50, 50], 0, 45, 10, [0, 0, 100, 100]);
    expect(pieces.length).toBeGreaterThanOrEqual(10);
    const angles = new Set(pieces.map((p) => p.angle));
    expect(angles).toEqual(new Set([45, 135]));
    for (let i = 1; i < pieces.length; i++) expect(pieces[i]!.angle).not.toBe(pieces[i - 1]!.angle);
  });

  it('parallèle par défaut : une seule pièce, le sens de la forme', () => {
    const z = zone({});
    const pieces = zoneFillPieces(z, zonePolygon(z), { w: 400, h: 400 }, 4, 1);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ angle: 30, solid: false });
  });

  it('rien hors du panneau', () => {
    const z = zone({ x: -500, fill: defaultFill('eventail') });
    expect(zoneFillPieces(z, zonePolygon(z), { w: 400, h: 400 }, 4, 1)).toEqual([]);
  });

  it('rendu stable : mêmes pièces pour la même graine', () => {
    const a = fanPieces([0, 0], [10, 10, 200, 200], 4, 9);
    const b = fanPieces([0, 0], [10, 10, 200, 200], 4, 9);
    expect(a).toEqual(b);
  });

  it('normalise la disposition', () => {
    const p = normalizeProject({
      panel: {},
      zones: [
        { type: 'rect', fill: { type: 'eventail', cx: 99, open: 5, band: -3 } },
        { type: 'rect', fill: { type: 'spirale' } },
        { type: 'rect', fill: 'x' },
        // les cercles ont été retirés : un ancien projet retombe en parallèle
        { type: 'rect', fill: { type: 'concentrique' } },
      ],
    });
    expect(p.zones[0]!.fill).toEqual({ type: 'eventail', cx: 3, cy: 0.5, open: 10, band: 2 });
    expect(p.zones[1]!.fill?.type).toBe('parallele');
    expect(p.zones[2]!.fill).toBeUndefined();
    expect(p.zones[3]!.fill?.type).toBe('parallele');
  });

  it('change de disposition en gardant ce qui a un sens', () => {
    const f = { ...defaultFill('eventail'), cx: 0.2, cy: -0.3, open: 30 };
    expect(defaultFill('eventail', f)).toMatchObject({ cx: 0.2, cy: -0.3 });
    expect(defaultFill('chevron', f)).toMatchObject({ cx: 0, cy: 0, open: 30 });
  });
});
