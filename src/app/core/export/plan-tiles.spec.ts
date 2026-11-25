import { describe, expect, it } from 'vitest';
import { exampleProject } from '../model/normalize';
import { tiledPlanHtml, tileLayout } from './plan-tiles';

describe('plan en pages A4', () => {
  it('un sous-bock tient sur une page', () => {
    expect(tileLayout({ w: 100, h: 100 }).tiles).toHaveLength(1);
  });

  it('couvre tout le panneau avec recouvrement', () => {
    const L = tileLayout({ w: 400, h: 700 });
    const last = L.tiles[L.tiles.length - 1]!;
    expect(last.x + last.w).toBeGreaterThanOrEqual(400);
    expect(last.y + last.h).toBeGreaterThanOrEqual(700);
    expect(L.tiles[1]!.x).toBeCloseTo(L.cellW - 10);
    expect(L.tiles.map((t) => t.label)).toContain('A1');
  });

  it('choisit l\'orientation qui économise du papier', () => {
    // 450 × 150 : façade de tiroir, mieux en paysage
    const L = tileLayout({ w: 450, h: 150 });
    expect(L.landscape).toBe(true);
    expect(L.tiles).toHaveLength(2);
  });

  it('produit un document avec une section par page', () => {
    const p = exampleProject();
    const html = tiledPlanHtml(p);
    const n = tileLayout(p.panel).tiles.length;
    expect(html.match(/class="page"/g)).toHaveLength(n);
    expect(html).toContain('@page');
  });
});
