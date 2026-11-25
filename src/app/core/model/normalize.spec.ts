import { exampleProject, looksLikeProject, normalizeProject } from './normalize';

describe('normalizeProject', () => {
  it('donne un projet par défaut complet à partir de rien', () => {
    const p = normalizeProject(null);
    expect(p.panel).toEqual({ w: 400, h: 700 });
    expect(p.sw).toBe(4);
    expect(p.view).toBe('rendu');
    expect(p.edge).toEqual({ type: 'droit', size: 5 });
    expect(p.zones).toEqual([]);
  });

  it('borne chaque nombre', () => {
    const p = normalizeProject({ panel: { w: 1, h: 99999 }, thick: 500, sw: 0, irr: 3, light: 400, elev: 0, contrast: -1, gloss: 2 });
    expect(p.panel).toEqual({ w: 20, h: 5000 });
    expect(p.thick).toBe(60);
    expect(p.sw).toBe(1);
    expect(p.irr).toBe(1);
    expect(p.light).toBe(359);
    expect(p.elev).toBe(5);
    expect(p.contrast).toBe(0);
    expect(p.gloss).toBe(1);
  });

  it('remplace couleurs et profils inconnus, ignore les types inconnus', () => {
    const p = normalizeProject({
      panel: { w: 100, h: 100 },
      bg: { mode: 'marbre', color: 'fuchsia' },
      edge: { type: 'doucine', size: 3 },
      zones: [
        { type: 'rect', color: 'fuchsia', x: 1, y: 2, w: 3, h: 4 },
        { type: 'étoile' },
        null,
        { type: 'ellipse', hole: true, edge: { type: 'arrondi', size: 999 } },
      ],
    });
    expect(p.bg.mode).toBe('paille');
    expect(p.bg.color).toBe('naturel');
    expect(p.edge.type).toBe('droit');
    expect(p.zones).toHaveLength(2);
    expect(p.zones[0]!.color).toBe('naturel');
    expect(p.zones[1]!.edge).toEqual({ type: 'arrondi', size: 40 });
  });

  it('réattribue les ids à partir de 1', () => {
    const p = normalizeProject({ panel: {}, zones: [{ type: 'rect', id: 99 }, { type: 'hex', id: 99 }] });
    expect(p.zones.map((z) => z.id)).toEqual([1, 2]);
  });

  it('tronque les noms à 40 caractères et les garde en texte', () => {
    const p = normalizeProject({ panel: {}, zones: [{ type: 'rect', name: '<b>' + 'x'.repeat(60) }] });
    expect(p.zones[0]!.name).toHaveLength(40);
    expect(p.zones[0]!.name.startsWith('<b>')).toBe(true);
  });

  it('rejette les secteurs de moins de 3 points et borne leurs coordonnées', () => {
    const p = normalizeProject({
      panel: {},
      zones: [
        { type: 'poly', pts: [[0, 0], [1, 1]] },
        { type: 'poly', pts: [[0, 0], [5, 0], [0, -5], 'x'] },
      ],
    });
    expect(p.zones).toHaveLength(1);
    expect(p.zones[0]!.pts).toEqual([[0, 0], [1, 0], [0, -1]]);
  });

  it('est idempotente', () => {
    const p = exampleProject();
    expect(normalizeProject(JSON.parse(JSON.stringify(p)))).toEqual(normalizeProject(p));
  });

  it('reconnaît un projet importable', () => {
    expect(looksLikeProject({ panel: {} })).toBe(true);
    expect(looksLikeProject({})).toBe(false);
    expect(looksLikeProject('x')).toBe(false);
  });
});

describe('exampleProject', () => {
  it('porte de buffet en soleil 12 rayons, chant arrondi 4 mm, prise de main arrondie 6 mm', () => {
    const p = exampleProject();
    expect(p.panel).toEqual({ w: 400, h: 700 });
    expect(p.edge).toEqual({ type: 'arrondi', size: 4 });
    expect(p.zones.filter((z) => z.type === 'poly')).toHaveLength(12);
    const hole = p.zones.find((z) => z.hole);
    expect(hole?.edge).toEqual({ type: 'arrondi', size: 6 });
    expect(new Set(p.zones.map((z) => z.id)).size).toBe(p.zones.length);
  });
});
