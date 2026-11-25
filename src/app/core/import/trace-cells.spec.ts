import { describe, expect, it } from 'vitest';
import { pointInPolygon, signedArea } from '../geometry/geometry';
import { Point } from '../model/project';
import { buildCells, cellAt, isEllipse, shapeOutline, traceRegion } from './trace-cells';
import { planTrace } from './trace-plan';

const circle = (cx: number, cy: number, r: number, n = 96): Point[] =>
  Array.from({ length: n }, (_, i): Point => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);

describe('cases d\'un dessin au trait', () => {
  // grand cercle coupé en deux par un diamètre, petit cercle à cheval sur le diamètre
  const lines: Point[][] = [circle(50, 50, 45), [[5, 50], [95, 50]], circle(50, 50, 15)];
  const g = buildCells(lines, { maxSide: 400 });

  it('trouve l\'extérieur et quatre cases intérieures', () => {
    expect(g.outside.size).toBe(1);
    expect(g.count).toBe(5);
    const inner = [cellAt(g, [50, 25]), cellAt(g, [50, 75]), cellAt(g, [50, 45]), cellAt(g, [50, 55])];
    expect(new Set(inner).size).toBe(4);
    expect(inner.some((c) => g.outside.has(c))).toBe(false);
  });

  it('tous les pixels appartiennent à une case (les traits sont partagés)', () => {
    expect(g.labels.every((l) => l > 0)).toBe(true);
  });

  it('réunir les deux moitiés du petit cercle donne un disque plein', () => {
    const [s, ...rest] = traceRegion(g, new Set([cellAt(g, [50, 45]), cellAt(g, [50, 55])]));
    expect(rest).toHaveLength(0);
    expect(s!.holes).toHaveLength(0);
    expect(Math.abs(signedArea(s!.pts))).toBeCloseTo(Math.PI * 225, -1.5);
    expect(isEllipse(s!.pts)).toBe(true);
  });

  it('réunir les deux moitiés extérieures donne un anneau avec un creux', () => {
    const [s] = traceRegion(g, new Set([cellAt(g, [50, 25]), cellAt(g, [50, 75])]));
    expect(s!.holes).toHaveLength(1);
    const ring = shapeOutline(s!, 160);
    expect(pointInPolygon(ring, 50, 50)).toBe(false);
    expect(pointInPolygon(ring, 50, 20)).toBe(true);
    expect(Math.abs(signedArea(ring))).toBeCloseTo(Math.PI * (45 * 45 - 15 * 15), -2);
  });

  it('une demi-lune n\'est pas une ellipse', () => {
    const [s] = traceRegion(g, new Set([cellAt(g, [50, 25])]));
    expect(isEllipse(s!.pts)).toBe(false);
  });
});

describe('plan d\'import depuis le tracé', () => {
  const lines: Point[][] = [circle(50, 50, 45), circle(50, 50, 15), [[40, 10], [40, 30]]];
  const g = buildCells(lines, { maxSide: 400 });
  const all = Array.from({ length: g.count }, (_, i) => i + 1).filter((c) => !g.outside.has(c));
  const center = cellAt(g, [50, 50]);

  it('une plaque ronde donne un panneau rond, les zones suivent', () => {
    const plan = planTrace(
      g,
      [
        { id: 1, name: 'Plaque', role: 'plaque', color: 'naturel', cells: all },
        { id: 2, name: 'Œil', role: 'motif', color: 'ebene', cells: [center] },
        { id: 3, name: 'Perçage', role: 'trou', color: 'naturel', cells: [cellAt(g, [30, 50])] },
      ],
      { width: 100, x: 0, y: 0, angle: 90, maxPoints: 120 },
      1,
    );
    expect(plan.panel).toEqual({ w: 100, h: 100, round: true });
    expect(plan.zones.map((z) => z.name)).toEqual(['Œil', 'Perçage']);
    expect(plan.zones[0]!.x).toBeCloseTo(50, 0);
    expect(plan.zones[0]!.w).toBeCloseTo(100 / 3, 0);
    expect(plan.zones[1]!.hole).toBe(true);
  });
});
