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
