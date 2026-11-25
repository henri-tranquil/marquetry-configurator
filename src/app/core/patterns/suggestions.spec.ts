import { describe, expect, it } from 'vitest';
import { blankProject } from '../model/normalize';
import { suggestionsFor } from './suggestions';

describe('suggestions', () => {
  it('ne modifient pas le projet de départ', () => {
    const p = blankProject({ w: 100, h: 100 });
    const before = JSON.stringify(p);
    const s = suggestionsFor(p);
    expect(s.length).toBeGreaterThan(4);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('gardent les dimensions et les trous', () => {
    const p = blankProject({ w: 100, h: 100 });
    p.zones.push({ id: 1, type: 'ellipse', name: 'Trou', x: 50, y: 50, w: 10, h: 10, rot: 0, color: 'naturel', angle: 0, hole: true, edge: { type: 'droit', size: 0 } });
    for (const s of suggestionsFor(p)) {
      expect(s.result.panel).toEqual({ w: 100, h: 100 });
      expect(s.result.zones.filter((z) => z.hole)).toHaveLength(1);
    }
  });

  it('adaptent le nombre de rayons à un petit panneau', () => {
    const s = suggestionsFor(blankProject({ w: 100, h: 100 })).find((x) => x.id === 'soleil-bas')!;
    expect(s.result.zones.filter((z) => !z.hole).length).toBeLessThanOrEqual(9);
  });
});
