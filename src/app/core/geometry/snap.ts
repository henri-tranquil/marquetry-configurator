/**
 * Aimantation des gestes à la souris : bords, centres et milieux du panneau et des autres formes.
 * Tout est en mm ; la tolérance vient de l'écran (quelques px convertis en mm).
 */
import { Point, Project, Zone } from '../model/project';
import { BBox, PreparedZone, RAD } from './geometry';

export interface SnapGuides {
  /** Ligne verticale d'alignement (x en mm). */
  x?: number;
  /** Ligne horizontale d'alignement (y en mm). */
  y?: number;
  /** Point remarquable atteint. */
  point?: Point;
}

export interface Snapped<T> {
  value: T;
  guides: SnapGuides;
}

/** Repères d'alignement : bords et milieux du panneau et des autres formes (secteurs exclus, ils débordent). */
export function alignTargets(panel: Project['panel'], others: readonly PreparedZone[]): { xs: number[]; ys: number[] } {
  const xs = [0, panel.w / 2, panel.w];
  const ys = [0, panel.h / 2, panel.h];
  for (const o of others) {
    if (o.zone.type === 'poly') continue;
    const [x0, y0, x1, y1] = o.box;
    xs.push(x0, o.zone.x, x1);
    ys.push(y0, o.zone.y, y1);
  }
  return { xs, ys };
}

/** Meilleur décalage pour qu'un des repères mobiles tombe sur une cible, ou null. */
export function snapAxis(anchors: readonly number[], targets: readonly number[], tol: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const a of anchors)
    for (const t of targets) {
      const d = t - a;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  return best;
}

/**
 * Déplacement d'une forme : son centre et les bords de sa boîte s'aimantent
 * aux repères. `box` est la boîte de la forme à la position proposée (x, y).
 */
export function snapMove(x: number, y: number, box: BBox, targets: { xs: number[]; ys: number[] }, tol: number): Snapped<Point> {
  const sx = snapAxis([box[0], x, box[2]], targets.xs, tol);
  const sy = snapAxis([box[1], y, box[3]], targets.ys, tol);
  return {
    value: [x + (sx?.delta ?? 0), y + (sy?.delta ?? 0)],
    guides: { x: sx?.at, y: sy?.at },
  };
}

/** Centre, coins et milieux des côtés d'une forme (dans son propre repère, puis monde). */
export function zoneKeyPoints(z: Zone): Point[] {
  const r = z.rot * RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const out: Point[] = [];
  for (const a of [-0.5, 0, 0.5])
    for (const b of [-0.5, 0, 0.5]) {
      const lx = a * z.w;
      const ly = b * z.h;
      out.push([z.x + lx * c - ly * s, z.y + lx * s + ly * c]);
    }
  return out;
}

export function panelKeyPoints(panel: Project['panel']): Point[] {
  const out: Point[] = [];
  for (const a of [0, 0.5, 1]) for (const b of [0, 0.5, 1]) out.push([a * panel.w, b * panel.h]);
  return out;
}

/**
 * Point libre (origine de l'éventail) : d'abord les points remarquables,
 * sinon alignement sur les axes.
 */
export function snapPoint(
  p: Point,
  points: readonly Point[],
  targets: { xs: number[]; ys: number[] },
  tol: number,
): Snapped<Point> {
  let best: Point | null = null;
  let bd = tol;
  for (const q of points) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= bd) {
      bd = d;
      best = q;
    }
  }
  if (best) return { value: [best[0], best[1]], guides: { point: best } };
  const sx = snapAxis([p[0]], targets.xs, tol);
  const sy = snapAxis([p[1]], targets.ys, tol);
  return { value: [p[0] + (sx?.delta ?? 0), p[1] + (sy?.delta ?? 0)], guides: { x: sx?.at, y: sy?.at } };
}

/** Une dimension s'aimante aux valeurs données (ex. l'autre dimension, pour retrouver un cercle). */
export function snapLength(v: number, targets: readonly number[], tol: number): number {
  const s = snapAxis([v], targets, tol);
  return s ? v + s.delta : v;
}
