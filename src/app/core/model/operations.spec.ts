import { exampleProject } from './normalize';
import { duplicateZone, moveZone, newShape, nextId, reorderZone, resizePanel } from './operations';
import { Zone } from './project';

describe('opérations sur le projet', () => {
  it('met à l’échelle positions et tailles, sauf la taille des trous', () => {
    const p = exampleProject();
    const q = resizePanel(p, 800, 350);
    const hole = q.zones.find((z) => z.hole)!;
    const hole0 = p.zones.find((z) => z.hole)!;
    expect(hole.w).toBe(hole0.w);
    expect(hole.x).toBeCloseTo(hole0.x * 2);
    expect(hole.y).toBeCloseTo(hole0.y / 2);
    const plinth = q.zones.find((z) => z.name === 'Plinthe')!;
    expect(plinth.w).toBeCloseTo(800);
    expect(plinth.h).toBeCloseTo(11);
  });

  it('borne et arrondit les dimensions du panneau', () => {
    expect(resizePanel(exampleProject(), 3, 9999.6).panel).toEqual({ w: 20, h: 5000 });
  });

  it('crée trous et formes centrés', () => {
    const p = exampleProject();
    const h = newShape('hole-round', p, 99);
    expect(h).toMatchObject({ hole: true, x: 200, y: 350, w: 30, edge: { type: 'arrondi', size: 5 } });
    const hex = newShape('hex', p, 100);
    expect(hex.h).toBeCloseTo(hex.w * 0.866);
  });

  const zs = [1, 2, 3].map((id) => ({ id }) as Zone);

  it('change l’ordre de pose', () => {
    expect(moveZone(zs, 1, 1).map((z) => z.id)).toEqual([2, 1, 3]);
    expect(moveZone(zs, 3, 1).map((z) => z.id)).toEqual([1, 2, 3]);
    expect(reorderZone(zs, 0, 2).map((z) => z.id)).toEqual([2, 3, 1]);
    expect(nextId(zs)).toBe(4);
  });

  it('duplique avec un décalage et un nom borné', () => {
    const z = exampleProject().zones[0]!;
    const c = duplicateZone({ ...z, name: 'x'.repeat(40) }, 77);
    expect(c.id).toBe(77);
    expect(c.x).toBe(z.x + 10);
    expect(c.name).toHaveLength(40);
    expect(c.pts).not.toBe(z.pts);
  });
});
