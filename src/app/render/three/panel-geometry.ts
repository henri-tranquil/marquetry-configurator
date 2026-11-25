/**
 * Géométrie du panneau construite à la main (ExtrudeGeometry applique le même biseau
 * partout et met le biseau dans le matériau des parois).
 * Groupe 0 : paille (face + anneaux de profil). Groupe 1 : médium (parois + dos).
 * C'est ici, et seulement ici, qu'on passe du repère panneau (y vers le bas) au repère three (y vers le haut).
 */
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import {
  edgeInfo,
  offsetPolygon,
  panelPolygon,
  Prepared,
  PreparedZone,
  profileRadius,
  profileSteps,
} from '../../core/geometry/geometry';
import { EdgeProfile, Point, Project } from '../../core/model/project';

export interface DrilledHole {
  hole: PreparedZone;
  /** Rayon de profil retenu (0 = percé sans profil). */
  r: number;
}

export interface HolePlan {
  /** Rayon effectif du chant extérieur. */
  rO: number;
  /** Trous percés dans la géométrie ; les autres ne sont découpés que dans la texture. */
  drilled: DrilledHole[];
}

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/**
 * Un trou dont le profil sort du panneau (ou empiète sur le chant) ou chevauche un autre trou
 * est percé sans profil ; s'il chevauche encore, il n'est découpé que dans la texture.
 */
export function planHoles(p: Project, D: Prepared): HolePlan {
  const { w, h } = p.panel;
  const rO = profileRadius(p.edge, p.thick);
  const drilled: DrilledHole[] = [];
  const boxes: Box[] = [];
  for (const o of D.holes) {
    for (const r of [profileRadius(o.zone.edge, p.thick), 0]) {
      const b: Box = [o.box[0] - r, o.box[1] - r, o.box[2] + r, o.box[3] + r];
      const m = rO + 0.5;
      if (b[0] < m || b[1] < m || b[2] > w - m || b[3] > h - m) continue;
      if (boxes.some((u) => overlaps(b, u))) continue;
      boxes.push(b);
      drilled.push({ hole: o, r });
      break;
    }
  }
  return { rO, drilled };
}

interface Vert {
  x: number;
  y: number;
  z: number;
  n: [number, number, number];
  /** Direction du vide, dans le plan (repère panneau). */
  u: Point;
  /** Angle du profil en radians. */
  t: number;
}

interface Buf {
  p: number[];
  n: number[];
  uv: number[];
  u: number[];
  t: number[];
}

export function buildPanelGeometry(p: Project, plan: HolePlan): BufferGeometry {
  const { w, h } = p.panel;
  const th = p.thick;
  const B: [Buf, Buf] = [
    { p: [], n: [], uv: [], u: [], t: [] },
    { p: [], n: [], uv: [], u: [], t: [] },
  ];

  const emit = (g: 0 | 1, v: Vert) => {
    const b = B[g];
    b.p.push(v.x - w / 2, h / 2 - v.y, v.z);
    b.n.push(v.n[0], -v.n[1], v.n[2]);
    // UV = projection xy : la paille des profils continue celle de la façade
    b.uv.push(v.x / w, 1 - v.y / h);
    b.u.push(v.u[0], -v.u[1]);
    b.t.push(v.t);
  };

  const quad = (g: 0 | 1, a: Vert, b: Vert, c: Vert, d: Vert) => {
    const A = [a.x, -a.y, a.z];
    const Bq = [b.x, -b.y, b.z];
    const C = [c.x, -c.y, c.z];
    const e1 = [Bq[0]! - A[0]!, Bq[1]! - A[1]!, Bq[2]! - A[2]!];
    const e2 = [C[0]! - A[0]!, C[1]! - A[1]!, C[2]! - A[2]!];
    const cr = [
      e1[1]! * e2[2]! - e1[2]! * e2[1]!,
      e1[2]! * e2[0]! - e1[0]! * e2[2]!,
      e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
    const nn = [a.n[0] + c.n[0], -(a.n[1] + c.n[1]), a.n[2] + c.n[2]];
    const ok = cr[0]! * nn[0]! + cr[1]! * nn[1]! + cr[2]! * nn[2]! >= 0;
    for (const v of ok ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) emit(g, v);
  };

  const tri = (outer: Point[], holes: Point[][], z: number, nz: 1 | -1, g: 0 | 1) => {
    const V = (q: Point) => new Vector2(q[0], -q[1]);
    const o = outer.map(V);
    const hs = holes.map((q) => q.map(V));
    if (ShapeUtils.isClockWise(o)) o.reverse();
    for (const q of hs) if (!ShapeUtils.isClockWise(q)) q.reverse();
    const all = o.concat(...hs);
    for (const [i = 0, j = 0, k = 0] of ShapeUtils.triangulateShape(o, hs)) {
      const a = all[i];
      let b = all[j];
      let c = all[k];
      if (!a || !b || !c) continue;
      const cz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cz * nz < 0) [b, c] = [c, b];
      for (const q of [a, b, c]) emit(g, { x: q.x, y: -q.y, z, n: [0, 0, nz], u: [1, 0], t: 0 });
    }
  };

  /** Anneau de profil + paroi d'un contour ; renvoie le contour de la face avant. */
  const ring = (poly: Point[], matIn: boolean, e: EdgeProfile, r: number): Point[] => {
    const I = edgeInfo(poly, matIn);
    const pr = profileSteps(e, r);
    const n = poly.length;
    const ups = pr.map((q) => offsetPolygon(poly, I, q.d));
    // direction du vide : onglet si le sommet est lisse (< 35°), normale de l'arête sinon
    const voidDir = (j: number, i: number): Point => {
      const m = I.vm[j]!;
      const en = I.en[i]!;
      return I.sm[j] ? [-m[0], -m[1]] : [-en[0], -en[1]];
    };
    const V = (k: number, j: number, i: number, wall = false, z = 0): Vert => {
      const q = wall ? poly[j]! : ups[k]![j]!;
      const u = voidDir(j, i);
      const t = wall ? Math.PI / 2 : pr[k]!.t;
      const sn = Math.sin(t);
      const cs = Math.cos(t);
      return {
        x: q[0],
        y: q[1],
        z: wall ? z : pr[k]!.z,
        n: wall ? [u[0], u[1], 0] : [u[0] * sn, u[1] * sn, cs],
        u,
        t,
      };
    };
    const z0 = pr[pr.length - 1]!.z;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (let k = 0; k < pr.length - 1; k++) quad(0, V(k, i, i), V(k, j, i), V(k + 1, j, i), V(k + 1, i, i));
      quad(1, V(0, i, i, true, z0), V(0, j, i, true, z0), V(0, j, i, true, -th), V(0, i, i, true, -th));
    }
    return ups[0]!;
  };

  const PR = panelPolygon(p.panel);
  const front = ring(PR, true, p.edge, plan.rO);
  const frontHoles = plan.drilled.map(({ hole, r }) => ring(hole.poly, false, hole.zone.edge ?? { type: 'droit', size: 0 }, r));
  tri(front, frontHoles, 0, 1, 0);
  tri(PR, plan.drilled.map(({ hole }) => hole.poly), -th, -1, 1);

  const g = new BufferGeometry();
  const cat = (k: keyof Buf) => B[0][k].concat(B[1][k]);
  const n0 = B[0].p.length / 3;
  const n1 = B[1].p.length / 3;
  g.setAttribute('position', new Float32BufferAttribute(cat('p'), 3));
  g.setAttribute('normal', new Float32BufferAttribute(cat('n'), 3));
  g.setAttribute('uv', new Float32BufferAttribute(cat('uv'), 2));
  g.setAttribute('aU', new Float32BufferAttribute(cat('u'), 2));
  g.setAttribute('aT', new Float32BufferAttribute(cat('t'), 1));
  g.addGroup(0, n0, 0);
  g.addGroup(n0, n1, 1);
  return g;
}
