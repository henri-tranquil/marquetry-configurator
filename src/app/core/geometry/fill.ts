/**
 * Disposition des brins dans une forme : découpe en « pièces » pures (en mm).
 * - pièce non pleine (`solid: false`) : zone remplie de bandes parallèles (parallèle, bandes du chevron) ;
 * - pièce pleine (`solid: true`) : un brin unique de direction constante (éventail).
 * Le rendu 2D, le plan, le SVG et la texture de direction 3D partent tous de ces pièces.
 */
import { Point, Project, STRAW_SEGMENT, Zone } from '../model/project';
import { bbox, BBox, RAD } from './geometry';

export interface FillPiece {
  poly: Point[];
  /** Sens du fil de la pièce, 0–180 (repère panneau). */
  angle: number;
  solid: boolean;
  /** Rang de la pièce (brin de l'éventail, bande du chevron). */
  lane: number;
  /** Variation de teinte stable, 0–1. */
  jitter: number;
  /** Joints et coupes transversales à tracer en sombre (pièces pleines). */
  seams: [Point, Point][];
  /** Ligne médiane dans le sens du fil, pour les hachures du plan (pièces pleines). */
  axis: Point[];
}

/** Garde-fous : au-delà, le rendu deviendrait trop lent. */
const MAX_FAN_STRIPS = 20000;

const dir = (t: number): Point => [Math.cos(t), Math.sin(t)];
const at = (c: Point, r: number, t: number): Point => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
const deg180 = (rad: number) => (((rad / RAD) % 180) + 180) % 180;

/** Hachage stable vers [0, 1). */
export function hash01(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Point d'origine de l'éventail, en mm (repère panneau). */
export function fillCenter(z: Zone): Point {
  const a = (z.fill?.cx ?? 0) * z.w;
  const b = (z.fill?.cy ?? 0) * z.h;
  const r = z.rot * RAD;
  return [z.x + a * Math.cos(r) - b * Math.sin(r), z.y + a * Math.sin(r) + b * Math.cos(r)];
}

/** Inverse de fillCenter : point panneau → coordonnées normalisées de la forme. */
export function toZoneLocal(z: Zone, p: Point): Point {
  const dx = p[0] - z.x;
  const dy = p[1] - z.y;
  const r = -z.rot * RAD;
  return [(dx * Math.cos(r) - dy * Math.sin(r)) / z.w, (dx * Math.sin(r) + dy * Math.cos(r)) / z.h];
}

export function intersectBox(a: BBox, b: BBox): BBox | null {
  const r: BBox = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}

const corners = (b: BBox): Point[] => [
  [b[0], b[1]],
  [b[2], b[1]],
  [b[2], b[3]],
  [b[0], b[3]],
];

/** Distances min et max du point à la boîte. */
export function distRange(c: Point, b: BBox): [number, number] {
  const dx = Math.max(b[0] - c[0], 0, c[0] - b[2]);
  const dy = Math.max(b[1] - c[1], 0, c[1] - b[3]);
  const rmax = Math.max(...corners(b).map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
  return [Math.hypot(dx, dy), rmax];
}

/** Secteur angulaire (radians) couvrant la boîte vue du point ; tour complet si le point est dedans. */
export function angularSpan(c: Point, b: BBox): [number, number] {
  if (c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3]) return [0, 2 * Math.PI];
  const angles = corners(b).map((q) => Math.atan2(q[1] - c[1], q[0] - c[0]));
  const a0 = angles[0]!;
  let lo = 0;
  let hi = 0;
  for (const a of angles) {
    let d = a - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [a0 + lo, a0 + hi];
}

/**
 * Éventail : brins en coin rayonnant depuis `c`, larges de `sw` à la plus grande distance.
 * Le fil de chaque brin suit son rayon.
 */
export function fanPieces(c: Point, box: BBox, sw: number, seed: number): FillPiece[] {
  const [rmin, rmax] = distRange(c, box);
  if (rmax <= 0) return [];
  const [a0, a1] = angularSpan(c, box);
  const dt = Math.max(sw / rmax, (a1 - a0) / MAX_FAN_STRIPS);
  const R = rmax + 1;
  const r0 = Math.max(0, rmin - 1);
  const out: FillPiece[] = [];
  // grille angulaire globale : les brins ne glissent pas quand la boîte change
  for (let i = Math.floor(a0 / dt); i * dt < a1; i++) {
    const t0 = i * dt;
    const t1 = t0 + dt;
    const tm = t0 + dt / 2;
    const poly: Point[] = r0 > 0 ? [at(c, r0, t0), at(c, R, t0), at(c, R, t1), at(c, r0, t1)] : [c, at(c, R, t0), at(c, R, t1)];
    const seams: [Point, Point][] = [[at(c, r0, t0), at(c, R, t0)]];
    // coupes transversales tous les ~140 mm (longueur utile d'un brin)
    let r = rmin - hash01(seed, i, 1) * STRAW_SEGMENT;
    let k = 0;
    while (true) {
      r += STRAW_SEGMENT * (0.6 + hash01(seed, i, 2 + k++) * 0.8);
      if (r >= rmax) break;
      if (r > rmin) seams.push([at(c, r, t0), at(c, r, t1)]);
    }
    out.push({ poly, angle: deg180(tm), solid: true, lane: i, jitter: hash01(seed, i), seams, axis: [at(c, r0, tm), at(c, R, tm)] });
  }
  return out;
}

/**
 * Chevron (arête de poisson) : bandes parallèles à l'axe, larges de `band` mm, calées sur le centre
 * de la forme ; le fil alterne de ±open autour de l'axe d'une bande à l'autre.
 */
export function chevronPieces(origin: Point, axisDeg: number, open: number, band: number, box: BBox): FillPiece[] {
  const u = dir(axisDeg * RAD);
  const v: Point = [-u[1], u[0]];
  const proj = corners(box).map((q) => {
    const dx = q[0] - origin[0];
    const dy = q[1] - origin[1];
    return [dx * u[0] + dy * u[1], dx * v[0] + dy * v[1]] as Point;
  });
  const s0 = Math.min(...proj.map((p) => p[0])) - 1;
  const s1 = Math.max(...proj.map((p) => p[0])) + 1;
  const v0 = Math.min(...proj.map((p) => p[1]));
  const v1 = Math.max(...proj.map((p) => p[1]));
  const P = (s: number, t: number): Point => [origin[0] + u[0] * s + v[0] * t, origin[1] + u[1] * s + v[1] * t];
  const out: FillPiece[] = [];
  for (let j = Math.floor(v0 / band); j * band < v1; j++) {
    const t0 = j * band;
    const t1 = t0 + band;
    const a = axisDeg + (j % 2 === 0 ? open : -open);
    out.push({
      poly: [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)],
      angle: ((a % 180) + 180) % 180,
      solid: false,
      lane: j,
      jitter: 0,
      seams: [],
      axis: [],
    });
  }
  return out;
}

/** Découpe d'une forme selon sa disposition, bornée à bbox(forme) ∩ panneau. */
export function zoneFillPieces(z: Zone, poly: Point[], panel: Project['panel'], sw: number, seed: number): FillPiece[] {
  const box = intersectBox(bbox(poly), [0, 0, panel.w, panel.h]);
  if (!box) return [];
  const f = z.fill;
  switch (f?.type) {
    case 'eventail':
      return fanPieces(fillCenter(z), box, sw, seed);
    case 'chevron':
      return chevronPieces([z.x, z.y], z.angle, f.open, f.band, box);
    default:
      return [{ poly, angle: z.angle, solid: false, lane: 0, jitter: 0, seams: [], axis: [] }];
  }
}

/** La disposition a-t-elle un point d'origine réglable ? */
export const hasFillCenter = (z: Zone) => !z.hole && z.fill?.type === 'eventail';
