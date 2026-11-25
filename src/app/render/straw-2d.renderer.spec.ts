import { sheen } from './straw-2d.renderer';

describe('reflets 2D (ne pas inverser)', () => {
  it('la paille brille quand la lumière arrive en travers des brins', () => {
    const across = sheen(90, 0, 0.7);
    const along = sheen(0, 0, 0.7);
    expect(across).toBeGreaterThan(along);
    expect(along).toBeCloseTo(1 - 0.7 * 0.42);
    expect(across).toBeCloseTo(1 - 0.7 * 0.42 + 0.7 * 0.72);
  });

  it('un brin n’a pas de sens : 180° près', () => {
    expect(sheen(30, 200, 0.5)).toBeCloseTo(sheen(210, 200, 0.5));
  });

  it('contraste nul : luminosité neutre', () => {
    expect(sheen(37, 211, 0)).toBe(1);
  });
});
