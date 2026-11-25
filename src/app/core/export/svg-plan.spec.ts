import { exampleProject, normalizeProject } from '../model/normalize';
import { svgPlan } from './svg-plan';

describe('plan SVG', () => {
  it('est en millimètres pour une impression 1:1', () => {
    const s = svgPlan(exampleProject());
    expect(s).toContain('width="400mm" height="700mm" viewBox="0 0 400 700"');
  });

  it('trace les trous en pointillés rouges et le début des profils en gris', () => {
    const s = svgPlan(exampleProject());
    expect(s).toContain('stroke="#e2483d"');
    expect(s).toContain('stroke="#777"');
  });

  it("n'injecte jamais le nom des zones", () => {
    const p = normalizeProject({ panel: { w: 100, h: 100 }, zones: [{ type: 'rect', x: 50, y: 50, w: 40, h: 40, name: '<script>alert(1)</script>' }] });
    const s = svgPlan(p);
    expect(s).not.toContain('<script');
    expect(s).toContain('>1</text>');
  });
});

describe('plan SVG des dispositions', () => {
  it("trace l'éventail en lignes rayonnantes avec une croix d'origine", () => {
    const p = normalizeProject({ panel: { w: 100, h: 100 }, zones: [{ type: 'rect', x: 50, y: 50, w: 100, h: 100, fill: { type: 'eventail' } }] });
    const s = svgPlan(p);
    expect(s).toContain('<polyline');
    expect(s).toContain('clip-path="url(#c0)"');
    expect(s).toContain('h8M');
  });

  it('trace le chevron avec un motif par sens', () => {
    const p = normalizeProject({ panel: { w: 100, h: 100 }, zones: [{ type: 'rect', x: 50, y: 50, w: 100, h: 100, angle: 0, fill: { type: 'chevron', open: 45, band: 10 } }] });
    const s = svgPlan(p);
    expect(s).toContain('rotate(45)');
    expect(s).toContain('rotate(135)');
  });
});
