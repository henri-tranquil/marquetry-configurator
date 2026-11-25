/**
 * Chemins SVG → polylignes. Toutes les commandes (M L H V C S Q T A Z, absolues et relatives) ;
 * les courbes et arcs sont échantillonnés. Fonctions pures, testables sans DOM.
 */
import { Point } from '../model/project';

/** Matrice affine SVG [a, b, c, d, e, f] : x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Matrix, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

export function numbers(s: string): number[] {
  return (s.match(NUM) ?? []).map(Number);
}

/** Attribut transform : matrix, translate, scale, rotate, skewX, skewY, enchaînés. */
export function parseTransform(s: string | null | undefined): Matrix {
  let m: Matrix = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (const [, fn, args] of s.matchAll(re)) {
    const a = numbers(args ?? '');
    let t: Matrix = IDENTITY;
    const r = ((a[0] ?? 0) * Math.PI) / 180;
    switch (fn) {
      case 'matrix':
        if (a.length === 6) t = a as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const c = Math.cos(r);
        const sn = Math.sin(r);
        const cx = a[1] ?? 0;
        const cy = a[2] ?? 0;
        t = multiply(multiply([1, 0, 0, 1, cx, cy], [c, sn, -sn, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(r), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(r), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

export interface SubPath {
  pts: Point[];
  closed: boolean;
}

/** Nombre de segments pour une courbe selon sa longueur approximative (tol ≈ précision en unités SVG). */
function steps(len: number, tol: number): number {
  return Math.min(64, Math.max(4, Math.ceil(len / Math.max(tol, 1e-6) / 4)));
}

function cubic(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point, tol: number): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = steps(len, tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quad(out: Point[], p0: Point, p1: Point, p2: Point, tol: number): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = steps(len, tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

/** Arc elliptique SVG (paramétrisation par les extrémités, spec SVG F.6.5). */
function arc(out: Point[], p0: Point, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Point, tol: number): void {
  if (!rx || !ry) {
    out.push(p1);
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy;
  const y1 = -sp * dx + cp * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2;
  const cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.min(96, Math.max(4, Math.ceil(steps(Math.abs(dt) * Math.max(rx, ry), tol))));
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    out.push([cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp]);
  }
}

/** Attribut d d'un chemin → sous-chemins en polylignes (unités SVG). */
export function parsePath(d: string, tol = 0.5): SubPath[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: SubPath[] = [];
  let cur: Point[] = [];
  let pos: Point = [0, 0];
  let start: Point = [0, 0];
  let lastCtrl: Point | null = null;
  let lastCmd = '';
  let i = 0;
  const flush = (closed: boolean) => {
    if (cur.length > 1) out.push({ pts: cur, closed });
    cur = [];
  };
  const isNum = (t: string | undefined) => t !== undefined && !/^[a-zA-Z]$/.test(t);
  const n = () => Number(tokens[i++]);
  let cmd = '';
  while (i < tokens.length) {
    if (!isNum(tokens[i])) cmd = tokens[i++] ?? '';
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const P = (x: number, y: number): Point => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    if (C === 'Z') {
      pos = start;
      flush(true);
      lastCtrl = null;
      lastCmd = 'Z';
      continue;
    }
    if (!isNum(tokens[i])) continue;
    switch (C) {
      case 'M': {
        flush(false);
        pos = P(n(), n());
        start = pos;
        cur = [pos];
        // les paires suivantes sont des lineto implicites
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
        pos = P(n(), n());
        cur.push(pos);
        lastCtrl = null;
        break;
      case 'H':
        pos = [rel ? pos[0] + n() : n(), pos[1]];
        cur.push(pos);
        lastCtrl = null;
        break;
      case 'V':
        pos = [pos[0], rel ? pos[1] + n() : n()];
        cur.push(pos);
        lastCtrl = null;
        break;
      case 'C': {
        const c1 = P(n(), n());
        const c2 = P(n(), n());
        const p = P(n(), n());
        cubic(cur, pos, c1, c2, p, tol);
        lastCtrl = c2;
        pos = p;
        break;
      }
      case 'S': {
        const c1: Point = lastCtrl && 'CS'.includes(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        const c2 = P(n(), n());
        const p = P(n(), n());
        cubic(cur, pos, c1, c2, p, tol);
        lastCtrl = c2;
        pos = p;
        break;
      }
      case 'Q': {
        const c = P(n(), n());
        const p = P(n(), n());
        quad(cur, pos, c, p, tol);
        lastCtrl = c;
        pos = p;
        break;
      }
      case 'T': {
        const c: Point = lastCtrl && 'QT'.includes(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        const p = P(n(), n());
        quad(cur, pos, c, p, tol);
        lastCtrl = c;
        pos = p;
        break;
      }
      case 'A': {
        const rx = n();
        const ry = n();
        const rot = n();
        const large = n() !== 0;
        const sweep = n() !== 0;
        const p = P(n(), n());
        arc(cur, pos, rx, ry, rot, large, sweep, p, tol);
        lastCtrl = null;
        pos = p;
        break;
      }
      default:
        i++;
    }
    if (cur.length === 0) cur = [pos];
    lastCmd = C;
  }
  flush(false);
  return out;
}

/** Simplification de Ramer–Douglas–Peucker jusqu'à `max` points au plus. */
export function simplify(pts: Point[], max: number): Point[] {
  if (pts.length <= max) return pts;
  const dist = (p: Point, a: Point, b: Point) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1e-9;
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / l;
  };
  const rdp = (eps: number): Point[] => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      let best = -1;
      let bd = eps;
      for (let k = s + 1; k < e; k++) {
        const d = dist(pts[k]!, pts[s]!, pts[e]!);
        if (d > bd) {
          bd = d;
          best = k;
        }
      }
      if (best > 0) {
        keep[best] = 1;
        stack.push([s, best], [best, e]);
      }
    }
    return pts.filter((_, k) => keep[k]);
  };
  // dichotomie sur la tolérance
  let lo = 0;
  let hi = pts.reduce((m, p) => Math.max(m, Math.abs(p[0]), Math.abs(p[1])), 1);
  let res = rdp(hi);
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    const r = rdp(mid);
    if (r.length > max) lo = mid;
    else {
      hi = mid;
      res = r;
    }
  }
  return res.length >= 3 ? res : pts.slice(0, max);
}
