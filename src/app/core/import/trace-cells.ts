/**
 * Dessin au trait → cases. Les traits sont tracés sur une grille, chaque espace fermé entre les traits
 * devient une case ; les pixels de trait sont ensuite partagés entre les cases voisines, si bien que
 * des cases réunies forment une région continue dont le bord passe au milieu des traits.
 * Fonctions pures, sans DOM.
 */
import { bbox, BBox, bridgeHoles, pointInPolygon, signedArea } from '../geometry/geometry';
import { Point } from '../model/project';
import { simplify } from './svg-path';

export interface CellGrid {
  /** Taille de la grille (px). */
  w: number;
  h: number;
  /** Boîte du dessin (unités SVG) et passage unités → px. */
  box: BBox;
  scale: number;
  pad: number;
  /** Numéro de case de chaque pixel, de 1 à count (aucun 0 après partage des traits). */
  labels: Int32Array;
  /** Pixels de trait, pour l'affichage. */
  ink: Uint8Array;
  count: number;
  /** Surface de chaque case en px (indice = numéro de case). */
  areas: number[];
  /** Cases qui touchent le bord : l'extérieur du dessin. */
  outside: Set<number>;
}

export interface TraceOptions {
  /** Plus grand côté de la grille (px). */
  maxSide?: number;
  /** Épaisseur des traits sur la grille (px) : bouche les petits jours entre deux traits. */
  stroke?: number;
  /** Surface minimale d'une case (px) ; en dessous, c'est un bout de trait. */
  minCell?: number;
}

/** Trace des polylignes épaisses (tampon circulaire le long de chaque segment). */
function rasterize(lines: readonly Point[][], g: Pick<CellGrid, 'w' | 'h' | 'box' | 'scale' | 'pad'>, stroke: number): Uint8Array {
  const ink = new Uint8Array(g.w * g.h);
  const r = stroke / 2;
  const ri = Math.ceil(r);
  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - ri));
    const x1 = Math.min(g.w - 1, Math.ceil(cx + ri));
    const y0 = Math.max(0, Math.floor(cy - ri));
    const y1 = Math.min(g.h - 1, Math.ceil(cy + ri));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r + 0.25) ink[y * g.w + x] = 1;
  };
  const px = ([x, y]: Point): Point => [(x - g.box[0]) * g.scale + g.pad, (y - g.box[1]) * g.scale + g.pad];
  for (const line of lines) {
    // contours fermés : on referme
    const pts = line.map(px);
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f && l && pts.length > 2) pts.push(f);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let k = 0; k <= n; k++) stamp(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
    }
  }
  return ink;
}

export function buildCells(lines: readonly Point[][], o: TraceOptions = {}): CellGrid {
  const maxSide = o.maxSide ?? 800;
  const stroke = o.stroke ?? 2.4;
  const minCell = o.minCell ?? 16;
  const all = lines.flat();
  const box: BBox = all.length ? bbox(all) : [0, 0, 1, 1];
  const bw = Math.max(1e-9, box[2] - box[0]);
  const bh = Math.max(1e-9, box[3] - box[1]);
  const pad = 4;
  const scale = (maxSide - 2 * pad) / Math.max(bw, bh);
  const w = Math.max(8, Math.ceil(bw * scale) + 2 * pad);
  const h = Math.max(8, Math.ceil(bh * scale) + 2 * pad);
  const g = { w, h, box, scale, pad };
  const ink = rasterize(lines, g, stroke);

  // 1. cases : remplissage 4-connexe des pixels hors trait
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (ink[i] || labels[i]) continue;
    count++;
    let n = 0;
    labels[i] = count;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      n++;
      const x = j % w;
      const y = (j - x) / w;
      const visit = (k: number) => {
        if (ink[k] || labels[k]) return;
        labels[k] = count;
        stack.push(k);
      };
      if (x > 0) visit(j - 1);
      if (x < w - 1) visit(j + 1);
      if (y > 0) visit(j - w);
      if (y < h - 1) visit(j + w);
    }
    sizes.push(n);
  }

  // 2. miettes rendues au trait, puis numérotation compacte
  const remap = new Int32Array(count + 1);
  const areas: number[] = [0];
  let kept = 0;
  for (let c = 1; c <= count; c++)
    if (sizes[c]! >= minCell) {
      remap[c] = ++kept;
      areas.push(0);
    }
  for (let i = 0; i < w * h; i++) labels[i] = labels[i] ? remap[labels[i]!]! : 0;

  // 3. partage des pixels de trait : chaque pixel va à la case la plus proche (parcours en largeur)
  let queue: number[] = [];
  for (let i = 0; i < w * h; i++) if (labels[i]) queue.push(i);
  while (queue.length) {
    const next: number[] = [];
    for (const j of queue) {
      const c = labels[j]!;
      const x = j % w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) {
        if (k < 0 || k >= w * h || labels[k]) continue;
        labels[k] = c;
        next.push(k);
      }
    }
    queue = next;
  }
  for (let i = 0; i < w * h; i++) areas[labels[i]!] = (areas[labels[i]!] ?? 0) + 1;

  const outside = new Set<number>();
  for (let x = 0; x < w; x++) outside.add(labels[x]!).add(labels[(h - 1) * w + x]!);
  for (let y = 0; y < h; y++) outside.add(labels[y * w]!).add(labels[y * w + w - 1]!);
  outside.delete(0);
  return { w, h, box, scale, pad, labels, ink, count: kept, areas, outside };
}

/** Case sous un point (unités SVG), ou 0. */
export function cellAt(g: CellGrid, [x, y]: Point): number {
  const px = Math.floor((x - g.box[0]) * g.scale + g.pad);
  const py = Math.floor((y - g.box[1]) * g.scale + g.pad);
  if (px < 0 || py < 0 || px >= g.w || py >= g.h) return 0;
  return g.labels[py * g.w + px]!;
}

/** Contours (px) de la réunion des cases : bords de pixels chaînés en boucles. */
function loops(g: CellGrid, cells: ReadonlySet<number>): Point[][] {
  const { w, h, labels } = g;
  const W = w + 1;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && cells.has(labels[y * w + x]!);
  // arêtes orientées (sens horaire à l'écran autour de chaque pixel de la région)
  const from: number[] = [];
  const to: number[] = [];
  const out = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const a = y0 * W + x0;
    const e = from.length;
    from.push(a);
    to.push(y1 * W + x1);
    const l = out.get(a);
    if (l) l.push(e);
    else out.set(a, [e]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  const used = new Uint8Array(from.length);
  const res: Point[][] = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const loop: Point[] = [];
    let e = e0;
    while (!used[e]) {
      used[e] = 1;
      const a = from[e]!;
      loop.push([a % W, Math.floor(a / W)]);
      const cand = (out.get(to[e]!) ?? []).filter((k) => !used[k]);
      if (!cand.length) break;
      e = cand[0]!;
    }
    // points alignés supprimés
    const pts = loop.filter((p, i) => {
      const a = loop[(i + loop.length - 1) % loop.length]!;
      const b = loop[(i + 1) % loop.length]!;
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
    });
    if (pts.length >= 3) res.push(pts);
  }
  return res;
}

export interface TracedShape {
  /** Contour extérieur et creux, en unités SVG. */
  pts: Point[];
  holes: Point[][];
}

/** Lissage léger des marches de pixels (moyenne glissante sur 3 points). */
function smooth(p: Point[]): Point[] {
  const n = p.length;
  return p.map((q, i) => {
    const a = p[(i + n - 1) % n]!;
    const b = p[(i + 1) % n]!;
    return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4];
  });
}

/** Réunion de cases → formes (contour + creux) en unités SVG. Une réunion en plusieurs morceaux donne plusieurs formes. */
export function traceRegion(g: CellGrid, cells: ReadonlySet<number>): TracedShape[] {
  const ls = loops(g, cells).map((l) => simplifyClosed(smooth(l)));
  if (!ls.length) return [];
  const areas = ls.map((l) => signedArea(l));
  // le plus grand contour donne le sens des contours extérieurs
  const big = areas.reduce((m, a, i) => (Math.abs(a) > Math.abs(areas[m]!) ? i : m), 0);
  const outerSign = Math.sign(areas[big]!);
  const outers = ls.map((l, i) => ({ l, i })).filter(({ i }) => Math.sign(areas[i]!) === outerSign);
  const shapes = outers.map(({ l }) => ({ pts: l, holes: [] as Point[][] }));
  ls.forEach((l, i) => {
    if (Math.sign(areas[i]!) === outerSign) return;
    // creux : rattaché au plus petit contour extérieur qui le contient
    let best = -1;
    outers.forEach(({ l: o }, k) => {
      if (pointInPolygon(o, l[0]![0], l[0]![1]) && (best < 0 || Math.abs(signedArea(o)) < Math.abs(signedArea(outers[best]!.l))))
        best = k;
    });
    if (best >= 0) shapes[best]!.holes.push(l);
  });
  const toSvg = ([x, y]: Point): Point => [g.box[0] + (x - g.pad) / g.scale, g.box[1] + (y - g.pad) / g.scale];
  return shapes.map((s) => ({ pts: s.pts.map(toSvg), holes: s.holes.map((h) => h.map(toSvg)) }));
}

/** RDP sur une boucle fermée : on coupe en deux au point le plus éloigné du premier. */
function simplifyClosed(p: Point[]): Point[] {
  if (p.length <= 8) return p;
  const tol = 0.75;
  const rdp = (pts: Point[]): Point[] => {
    if (pts.length < 3) return pts;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1e-9;
    let best = 0;
    let bi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const q = pts[i]!;
      const d = Math.abs(dy * q[0] - dx * q[1] + b[0] * a[1] - b[1] * a[0]) / len;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best <= tol) return [a, b];
    return [...rdp(pts.slice(0, bi + 1)).slice(0, -1), ...rdp(pts.slice(bi))];
  };
  let far = 0;
  for (let i = 1; i < p.length; i++)
    if (Math.hypot(p[i]![0] - p[0]![0], p[i]![1] - p[0]![1]) > Math.hypot(p[far]![0] - p[0]![0], p[far]![1] - p[0]![1])) far = i;
  const r = [...rdp(p.slice(0, far + 1)).slice(0, -1), ...rdp([...p.slice(far), p[0]!]).slice(0, -1)];
  return r.length >= 3 ? r : p;
}

/** Contour unique (creux raccordés) limité en points, prêt pour une zone. */
export function shapeOutline(s: TracedShape, maxPoints: number): Point[] {
  const outer = simplify(s.pts, Math.max(8, Math.round(maxPoints * (s.holes.length ? 0.6 : 1))));
  if (!s.holes.length) return outer;
  const per = Math.max(6, Math.round((maxPoints * 0.4) / s.holes.length));
  const ring = bridgeHoles(outer, s.holes.slice(0, 12).map((h) => simplify(h, per)));
  return ring.length <= 300 ? ring : outer;
}

/**
 * Le contour ressemble-t-il à une ellipse (pour une plaque ronde) ?
 * Aire proche de π/4 de sa boîte et tous les points près de l'ellipse inscrite.
 */
export function isEllipse(pts: readonly Point[]): boolean {
  if (pts.length < 8) return false;
  const [x0, y0, x1, y1] = bbox(pts);
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  if (rx <= 0 || ry <= 0) return false;
  const ratio = Math.abs(signedArea(pts)) / (4 * rx * ry);
  if (Math.abs(ratio - Math.PI / 4) > 0.03) return false;
  const cx = x0 + rx;
  const cy = y0 + ry;
  return pts.every(([x, y]) => Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) < 0.06);
}
