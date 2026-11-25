import { Zone } from '../model/project';
import { prepare } from './geometry';
import { alignTargets, panelKeyPoints, snapAxis, snapLength, snapMove, snapPoint, zoneKeyPoints } from './snap';

const zone = (o: Partial<Zone>): Zone => ({
  id: 1, type: 'rect', name: 'z', x: 100, y: 100, w: 40, h: 20, rot: 0, color: 'naturel', angle: 0, hole: false, ...o,
});
const panel = { w: 400, h: 700 };

describe('aimantation', () => {
  it('garde le plus petit décalage dans la tolérance', () => {
    expect(snapAxis([10, 50], [0, 52], 5)).toEqual({ delta: 2, at: 52 });
    expect(snapAxis([10], [30], 5)).toBeNull();
  });

  it('centre une forme sur le panneau', () => {
    const t = alignTargets(panel, []);
    const s = snapMove(197, 352, [177, 342, 217, 362], t, 5);
    expect(s.value).toEqual([200, 350]);
    expect(s.guides).toEqual({ x: 200, y: 350 });
  });

  it('colle un bord au bord du panneau ou d’une autre forme', () => {
    const other = prepare([zone({ id: 2, x: 300, y: 100 })]).zones;
    const t = alignTargets(panel, other);
    // bord droit (x = 278) à 2 mm du bord gauche de l'autre forme (x = 280)
    const s = snapMove(258, 500, [238, 490, 278, 510], t, 5);
    expect(s.value[0]).toBe(260);
    expect(s.guides.x).toBe(280);
  });

  it('ignore les secteurs du soleil qui débordent', () => {
    const sector = prepare([zone({ id: 3, type: 'poly', x: 123, pts: [[0, 0], [0.5, 0], [0, 0.5]] })]).zones;
    expect(alignTargets(panel, sector).xs).not.toContain(123);
  });

  it("met l'origine de l'éventail pile au centre ou au milieu d'un bord", () => {
    const z = zone({});
    const pts = [...zoneKeyPoints(z), ...panelKeyPoints(panel)];
    expect(snapPoint([102, 98], pts, alignTargets(panel, []), 5)).toEqual({ value: [100, 100], guides: { point: [100, 100] } });
    expect(snapPoint([101, 112], pts, alignTargets(panel, []), 3).value).toEqual([100, 110]);
  });

  it("à défaut de point, s'aligne sur un axe", () => {
    const s = snapPoint([198, 30], [], alignTargets(panel, []), 5);
    expect(s.value).toEqual([200, 30]);
    expect(s.guides).toEqual({ x: 200, y: undefined });
  });

  it('suit la rotation de la forme', () => {
    const pts = zoneKeyPoints(zone({ rot: 90 }));
    // milieu du côté droit (0,5 ; 0) tourné de 90° : passe en bas
    expect(pts.some(([x, y]) => Math.abs(x - 100) < 1e-9 && Math.abs(y - 120) < 1e-9)).toBe(true);
  });

  it('une taille retrouve l’autre dimension (un cercle)', () => {
    expect(snapLength(61.5, [60], 3)).toBe(60);
    expect(snapLength(70, [60], 3)).toBe(70);
  });

  it('tolérance nulle (Alt) : aucune aimantation', () => {
    expect(snapMove(199, 351, [179, 341, 219, 361], alignTargets(panel, []), 0).value).toEqual([199, 351]);
  });
});
