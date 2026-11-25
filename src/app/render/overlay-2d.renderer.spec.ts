import { describe, expect, it } from 'vitest';
import { exampleProject } from '../core/model/normalize';
import { toMM } from './straw-2d.renderer';
import { zoneHandles, zoomAt, zoomedView } from './overlay-2d.renderer';

describe('zoom de la vue 2D', () => {
  const p = exampleProject();
  const W = 800;
  const H = 600;

  it('garde le point sous le pointeur immobile', () => {
    const z0 = { zoom: 1, panX: 0, panY: 0 };
    const at: [number, number] = [520, 210];
    const before = toMM(zoomedView(p, W, H, z0).view, at);
    const z1 = zoomAt(p, W, H, z0, 2.5, at);
    const after = toMM(zoomedView(p, W, H, z1).view, at);
    expect(z1.zoom).toBe(2.5);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it('borne le zoom', () => {
    expect(zoomAt(p, W, H, { zoom: 1, panX: 0, panY: 0 }, 1e6, [0, 0]).zoom).toBe(40);
  });
});

describe('poignées', () => {
  it('pas de poignées de taille sur un secteur qui déborde du panneau', () => {
    const p = exampleProject();
    const sector = p.zones.find((z) => z.type === 'poly')!;
    const v = zoomedView(p, 800, 600, { zoom: 1, panX: 0, panY: 0 }).view;
    expect(zoneHandles(sector, v, p.panel).transformable).toBe(false);
    const hole = p.zones.find((z) => z.hole)!;
    expect(zoneHandles(hole, v, p.panel).transformable).toBe(true);
  });
});
