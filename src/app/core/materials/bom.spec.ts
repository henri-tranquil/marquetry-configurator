import { normalizeProject } from '../model/normalize';
import { estimateMaterials, stripMeters, visibleAreas } from './bom';

describe('estimation matière', () => {
  it('mètres de bande = surface / sw × 1,15', () => {
    expect(stripMeters(4000 * 1000, 4)).toBeCloseTo(1150);
  });

  it('fond seul : toute la surface dans la couleur du fond', () => {
    const p = normalizeProject({ panel: { w: 120, h: 60 }, sw: 4, bg: { mode: 'paille', color: 'miel' } });
    const b = estimateMaterials(p);
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]!.key).toBe('miel');
    expect(b.rows[0]!.area).toBeCloseTo(7200);
    expect(b.totalMeters).toBeCloseTo((7200 / 4 / 1000) * 1.15);
  });

  it('exclut les trous et compte le médium sans bande', () => {
    const p = normalizeProject({
      panel: { w: 120, h: 120 },
      bg: { mode: 'bois' },
      zones: [{ type: 'rect', x: 60, y: 60, w: 60, h: 120, color: 'ebene' }, { type: 'rect', x: 30, y: 60, w: 30, h: 30, hole: true }],
    });
    const b = estimateMaterials(p);
    expect(b.holeArea).toBeCloseTo(900, -1);
    const wood = b.rows.find((r) => r.key === 'bois')!;
    expect(wood.meters).toBe(0);
    // le trou (15–45 mm) mord de 15 × 30 mm sur la zone ébène (30–90 mm)
    expect(b.rows.find((r) => r.key === 'ebene')!.area).toBeCloseTo(7200 - 450, -1);
  });

  it('ajoute les profils : périmètre × (longueur d’arc − r)', () => {
    const p = normalizeProject({ panel: { w: 100, h: 100 }, thick: 18, edge: { type: 'arrondi', size: 4 } });
    const b = estimateMaterials(p);
    expect(b.profileArea).toBeCloseTo(400 * ((Math.PI * 4) / 2 - 4));
  });
});

describe('surface visible par zone', () => {
  it('une zone recouverte en partie ne compte que sa partie visible', () => {
    const p = normalizeProject({
      panel: { w: 100, h: 100 },
      zones: [
        { type: 'rect', x: 50, y: 50, w: 100, h: 100, color: 'miel' },
        { type: 'rect', x: 25, y: 50, w: 50, h: 100, color: 'ebene' },
      ],
    });
    const a = visibleAreas(p);
    expect(a.get(1)?.area).toBeCloseTo(5000, -2);
    expect(a.get(2)?.area).toBeCloseTo(5000, -2);
  });
});

describe('estimation sur panneau rond', () => {
  it('ne compte que le disque', () => {
    const p = normalizeProject({ panel: { w: 100, h: 100, round: true }, bg: { mode: 'paille', color: 'miel' }, sw: 4 });
    const b = estimateMaterials(p);
    expect(b.rows[0]!.area).toBeCloseTo(Math.PI * 2500, -1);
  });
});
