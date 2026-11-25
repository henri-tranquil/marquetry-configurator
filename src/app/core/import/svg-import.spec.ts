import { describe, expect, it } from 'vitest';
import { signedArea } from '../geometry/geometry';
import { bridgeHoles, pointInPolygon } from '../geometry/geometry';
import { colorMapping, guessRoles, lengthMM, nearestStraw, parseColor, planImport, readSvg, svgToZones } from './svg-import';
import { parsePath, parseTransform, simplify } from './svg-path';

function svg(body: string, attrs = 'viewBox="0 0 100 50" width="100mm" height="50mm"'): Element {
  return new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`, 'image/svg+xml').documentElement;
}

describe('chemins SVG', () => {
  it('lit les commandes relatives et absolues, H, V, Z', () => {
    const [s] = parsePath('M10 10 h20 v10 H10 z');
    expect(s?.closed).toBe(true);
    expect(s?.pts).toEqual([[10, 10], [30, 10], [30, 20], [10, 20]]);
  });

  it('enchaîne les lineto implicites après M', () => {
    const [s] = parsePath('m0 0 10 0 0 10z');
    expect(s?.pts).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it('échantillonne un arc : le demi-cercle reste sur son rayon', () => {
    const [s] = parsePath('M0 0 A10 10 0 0 1 20 0', 0.1);
    for (const [x, y] of s?.pts ?? []) expect(Math.hypot(x - 10, y)).toBeCloseTo(10, 5);
    expect(Math.min(...(s?.pts ?? []).map((p) => p[1]))).toBeCloseTo(-10, 1);
  });

  it('sépare les sous-chemins', () => {
    expect(parsePath('M0 0L1 0L1 1ZM5 5L6 5L6 6Z')).toHaveLength(2);
  });

  it('compose les transformations', () => {
    expect(parseTransform('translate(10 5) scale(2)')).toEqual([2, 0, 0, 2, 10, 5]);
    const r = parseTransform('rotate(90)');
    expect(r[1]).toBeCloseTo(1);
    expect(r[2]).toBeCloseTo(-1);
  });

  it('simplifie sans dépasser le nombre de points demandé', () => {
    const pts = Array.from({ length: 500 }, (_, i): [number, number] => [Math.cos(i / 80), Math.sin(i / 80)]);
    const s = simplify(pts, 60);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.length).toBeGreaterThan(10);
  });
});

describe('import SVG', () => {
  it('convertit les unités de longueur', () => {
    expect(lengthMM('10cm')).toBe(100);
    expect(lengthMM('96px')).toBeCloseTo(25.4);
    expect(lengthMM('50%')).toBeNull();
  });

  it('lit les couleurs CSS courantes', () => {
    expect(parseColor('#abc')).toBe('#aabbcc');
    expect(parseColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(parseColor('none')).toBeNull();
    expect(parseColor('url(#g)')).toBeNull();
  });

  it('associe une couleur à la paille la plus proche', () => {
    expect(nearestStraw('#1a1a1a')).toBe('ebene');
    expect(nearestStraw('#2040a0')).toBe('indigo');
  });

  it('lit formes, transformations, styles et échelle physique', () => {
    const r = readSvg(
      svg(`<g transform="translate(10 0)" fill="#2040a0">
             <rect x="0" y="0" width="20" height="10"/>
             <circle cx="50" cy="25" r="10" style="fill:#1a1a1a"/>
           </g>
           <rect x="0" y="0" width="5" height="5" fill="none"/>
           <path d="M0 0" fill="red"/>`),
    );
    expect(r.shapes).toHaveLength(2);
    expect(r.mmPerUnit).toBe(1);
    expect(r.shapes[0]?.pts[0]).toEqual([10, 0]);
    expect(r.shapes[1]?.fill).toBe('#1a1a1a');
    expect(r.skipped).toBe(1);
    expect(colorMapping(r).map((c) => c.straw).sort()).toEqual(['ebene', 'indigo']);
  });

  it('ignore les éléments cachés et les définitions', () => {
    const r = readSvg(svg('<defs><rect width="10" height="10"/></defs><rect width="10" height="10" display="none"/>'));
    expect(r.shapes).toHaveLength(0);
  });

  it('pose les zones à la taille voulue, dans l\'ordre du document', () => {
    const r = readSvg(svg('<rect x="0" y="0" width="50" height="50" fill="#1a1a1a"/><rect x="50" y="0" width="50" height="50" fill="#2040a0"/>'));
    const zs = svgToZones(r, { width: 200, x: 100, y: 20, angle: 90, color: 'auto', maxPoints: 120 }, 7);
    expect(zs.map((z) => z.id)).toEqual([7, 8]);
    expect(zs.map((z) => z.color)).toEqual(['ebene', 'indigo']);
    expect(zs[0]?.x).toBeCloseTo(150);
    expect(zs[0]?.w).toBeCloseTo(100);
    expect(zs[1]?.x).toBeCloseTo(250);
    expect(zs[0]?.type).toBe('poly');
    const area = Math.abs(signedArea((zs[0]?.pts ?? []).map(([x, y]) => [x * 100, y * 100])));
    expect(area).toBeCloseTo(10000);
  });

  it('applique la correspondance de couleurs choisie', () => {
    const r = readSvg(svg('<rect width="50" height="50" fill="#1a1a1a"/>'));
    const [z] = svgToZones(r, { width: 50, x: 0, y: 0, angle: 0, color: 'auto', mapping: { '#1a1a1a': 'garance' }, maxPoints: 60 }, 1);
    expect(z?.color).toBe('garance');
  });
});

describe('dessins évidés', () => {
  const ring = 'M0 0H100V100H0Z M30 30H70V70H30Z';

  it('pair-impair : le carré intérieur est un creux', () => {
    const r = readSvg(svg(`<path fill-rule="evenodd" d="${ring}" fill="#1a1a1a"/>`, 'viewBox="0 0 100 100"'));
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0]?.holes).toHaveLength(1);
  });

  it('non nul : creux seulement si le sens est inversé', () => {
    const same = readSvg(svg(`<path d="${ring}"/>`, 'viewBox="0 0 100 100"'));
    expect(same.shapes.every((s) => s.holes.length === 0)).toBe(true);
    const inv = readSvg(svg('<path d="M0 0H100V100H0Z M30 30V70H70V30Z"/>', 'viewBox="0 0 100 100"'));
    expect(inv.shapes).toHaveLength(1);
    expect(inv.shapes[0]?.holes).toHaveLength(1);
  });

  it('une île dans le creux redevient une forme pleine', () => {
    const r = readSvg(svg(`<path fill-rule="evenodd" d="${ring} M45 45H55V55H45Z"/>`, 'viewBox="0 0 100 100"'));
    expect(r.shapes).toHaveLength(2);
  });

  it('la zone importée garde le creux : le centre est vide, l\'anneau plein', () => {
    const r = readSvg(svg(`<path fill-rule="evenodd" d="${ring}"/>`, 'viewBox="0 0 100 100"'));
    const [z] = svgToZones(r, { width: 100, x: 0, y: 0, angle: 0, color: 'auto', maxPoints: 120 }, 1);
    const pts = (z?.pts ?? []).map(([x, y]): [number, number] => [50 + x * 100, 50 + y * 100]);
    expect(pointInPolygon(pts, 50, 50)).toBe(false);
    expect(pointInPolygon(pts, 15, 50)).toBe(true);
    expect(Math.abs(signedArea(pts))).toBeCloseTo(10000 - 1600, 0);
  });

  it('raccorde plusieurs trous en un seul contour', () => {
    const outer: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const a: [number, number][] = [[10, 10], [20, 10], [20, 20], [10, 20]];
    const b: [number, number][] = [[60, 60], [80, 60], [80, 80], [60, 80]];
    const r = bridgeHoles(outer, [a, b]);
    expect(Math.abs(signedArea(r))).toBeCloseTo(10000 - 100 - 400);
    expect(pointInPolygon(r, 15, 15)).toBe(false);
    expect(pointInPolygon(r, 70, 70)).toBe(false);
    expect(pointInPolygon(r, 40, 40)).toBe(true);
  });
});

describe('rôles à l\'import', () => {
  const file = `<rect x="0" y="0" width="100" height="50" fill="#a57f55"/>
    <circle cx="25" cy="25" r="10" fill="#d6b25c"/>
    <circle cx="75" cy="25" r="5" fill="#ffffff"/>`;

  it('devine la plaque : la forme de fond qui couvre le dessin', () => {
    const r = readSvg(svg(file));
    expect(guessRoles(r)).toEqual(['plaque', 'motif', 'motif']);
  });

  it('la plaque donne le panneau, les trous sont des découpes', () => {
    const r = readSvg(svg(file));
    const plan = planImport(r, { width: 200, x: 999, y: 999, angle: 0, color: 'auto', maxPoints: 80, roles: ['plaque', 'motif', 'trou'] }, 1);
    expect(plan.panel).toEqual({ w: 200, h: 100 });
    expect(plan.zones).toHaveLength(2);
    expect(plan.zones[0]?.x).toBeCloseTo(50);
    expect(plan.zones[0]?.hole).toBe(false);
    expect(plan.zones[1]?.hole).toBe(true);
    expect(plan.zones[1]?.x).toBeCloseTo(150);
    expect(plan.zones[1]?.w).toBeCloseTo(20, 0);
  });

  it('une forme ignorée ne produit rien', () => {
    const r = readSvg(svg(file));
    const plan = planImport(r, { width: 100, x: 0, y: 0, angle: 0, color: 'auto', maxPoints: 80, roles: ['ignorer', 'ignorer', 'motif'] }, 1);
    expect(plan.panel).toBeNull();
    expect(plan.zones).toHaveLength(1);
  });
});
