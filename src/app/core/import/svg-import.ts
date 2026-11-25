/**
 * SVG → zones. Lit les formes fermées (path, rect, circle, ellipse, polygon, polyline, line),
 * applique les transformations, met à l'échelle en mm et choisit la paille la plus proche de chaque couleur.
 * Ne dépend que d'une interface d'élément minimale (le DOM du navigateur la satisfait).
 */
import { bbox, bridgeHoles, pointInPolygon, signedArea } from '../geometry/geometry';
import { Panel, strawInfo, PALETTE, Point, STRAW_COLORS, StrawColor, Zone } from '../model/project';
import { polyZone } from '../patterns/patterns';
import { plateToPanel } from './trace-cells';
import { apply, IDENTITY, Matrix, multiply, numbers, parsePath, parseTransform, simplify } from './svg-path';

/** Ce dont on a besoin d'un élément XML. */
export interface SvgNode {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  readonly children: Iterable<SvgNode>;
}

export interface SvgShape {
  /** Contour en unités SVG (après transformations). */
  pts: Point[];
  /** Évidements à l'intérieur du contour (sous-chemins en creux). */
  holes: Point[][];
  /** Couleur de remplissage CSS normalisée (#rrggbb), null si aucune. */
  fill: string | null;
  /** Identifiant ou titre de l'élément, pour nommer la zone. */
  label: string | null;
}

export interface SvgReadResult {
  shapes: SvgShape[];
  /** Boîte du dessin (unités SVG). */
  box: [number, number, number, number];
  /** mm par unité SVG d'après width/height du fichier, si exprimés en unités physiques. */
  mmPerUnit: number | null;
  /** Formes ignorées (ouvertes, trop petites, dégénérées). */
  skipped: number;
  /** Tous les traits visibles (contours tracés ou bords de formes remplies), pour construire des zones depuis le tracé. */
  lines: Point[][];
}

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'title', 'desc', 'metadata', 'style', 'script', 'text', 'linearGradient', 'radialGradient', 'filter']);
const MAX_SHAPES = 400;

/** Longueur SVG avec unité → mm (null si en %). */
export function lengthMM(v: string | null): number | null {
  if (!v) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v);
  if (!m) return null;
  return Number(m[1]) * (UNIT_MM[(m[2] ?? '').toLowerCase()] ?? 1);
}

/** Style en ligne et attributs de présentation, avec héritage. */
function readStyle(n: SvgNode, inherited: Record<string, string>): Record<string, string> {
  const out = { ...inherited };
  for (const k of ['fill', 'fill-rule', 'stroke', 'display', 'visibility', 'opacity', 'fill-opacity']) {
    const v = n.getAttribute(k);
    if (v) out[k] = v.trim();
  }
  for (const decl of (n.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  // l'opacité ne s'hérite pas comme le reste, mais 0 rend tout invisible
  return out;
}

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', brown: '#a52a2a', gray: '#808080', grey: '#808080', navy: '#000080', olive: '#808000',
  maroon: '#800000', pink: '#ffc0cb', gold: '#ffd700', tan: '#d2b48c', beige: '#f5f5dc', wheat: '#f5deb3',
  khaki: '#f0e68c', chocolate: '#d2691e', sienna: '#a0522d', teal: '#008080', purple: '#800080', silver: '#c0c0c0',
};

/** Couleur CSS simple → #rrggbb (hex, rgb(), noms courants). */
export function parseColor(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s === 'none' || s === 'transparent' || s.startsWith('url(')) return null;
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m?.[1]) return '#' + [...m[1]].map((c) => c + c).join('');
  m = /^#([0-9a-f]{6})/.exec(s);
  if (m?.[1]) return '#' + m[1];
  if (s.startsWith('rgb')) {
    const n = numbers(s);
    if (n.length >= 3) {
      const pct = s.includes('%');
      return '#' + n.slice(0, 3).map((c) => Math.round(Math.min(255, Math.max(0, pct ? c * 2.55 : c))).toString(16).padStart(2, '0')).join('');
    }
  }
  return null;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paille la plus proche d'une couleur (distance pondérée perceptuelle simple). */
export function nearestStraw(hex: string): StrawColor {
  const [r, g, b] = rgb(hex);
  let best: StrawColor = 'naturel';
  let bd = Infinity;
  for (const c of STRAW_COLORS) {
    const [r2, g2, b2] = rgb(PALETTE[c].hex);
    const rm = (r + r2) / 2;
    const d = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

const num = (n: SvgNode, k: string, d = 0): number => {
  const v = Number.parseFloat(n.getAttribute(k) ?? '');
  return Number.isFinite(v) ? v : d;
};

/** Contours fermés d'un élément de forme, en unités locales. */
function outlines(n: SvgNode, tol: number): Point[][] {
  switch (n.tagName.replace(/^svg:/, '')) {
    case 'rect': {
      const x = num(n, 'x');
      const y = num(n, 'y');
      const w = num(n, 'width');
      const h = num(n, 'height');
      if (w <= 0 || h <= 0) return [];
      let rx = num(n, 'rx', NaN);
      let ry = num(n, 'ry', NaN);
      if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0;
      if (!Number.isFinite(ry)) ry = rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
      const d = `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
      return parsePath(d, tol).map((s) => s.pts);
    }
    case 'circle': {
      const r = num(n, 'r');
      return r > 0 ? [ellipsePts(num(n, 'cx'), num(n, 'cy'), r, r)] : [];
    }
    case 'ellipse': {
      const rx = num(n, 'rx');
      const ry = num(n, 'ry');
      return rx > 0 && ry > 0 ? [ellipsePts(num(n, 'cx'), num(n, 'cy'), rx, ry)] : [];
    }
    case 'line':
      return [
        [
          [num(n, 'x1'), num(n, 'y1')],
          [num(n, 'x2'), num(n, 'y2')],
        ],
      ];
    case 'polygon':
    case 'polyline': {
      const v = numbers(n.getAttribute('points') ?? '');
      const pts: Point[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i]!, v[i + 1]!]);
      return pts.length >= 2 ? [pts] : [];
    }
    case 'path':
      // un sous-chemin rempli est fermé implicitement
      return parsePath(n.getAttribute('d') ?? '', tol).map((s) => s.pts);
    default:
      return [];
  }
}

/** Un point du contour a est-il dans b ? (vote sur quelques sommets, robuste aux contacts). */
function inside(a: Point[], b: Point[]): boolean {
  const step = Math.max(1, Math.floor(a.length / 5));
  let yes = 0;
  let n = 0;
  for (let i = 0; i < a.length && n < 5; i += step, n++) if (pointInPolygon(b, a[i]![0], a[i]![1])) yes++;
  return yes * 2 > n;
}

/**
 * Sous-chemins d'un même élément → formes pleines avec leurs évidements.
 * Pair-impair : un contour contenu dans un nombre impair d'autres est un creux.
 * Non nul : un contour tourné à l'inverse de celui qui le contient est un creux.
 */
export function groupHoles(polys: Point[][], evenOdd: boolean): { pts: Point[]; holes: Point[][] }[] {
  const area = polys.map((p) => signedArea(p));
  const parent = polys.map((p, i) => {
    let best = -1;
    for (let j = 0; j < polys.length; j++) {
      if (j === i || Math.abs(area[j]!) <= Math.abs(area[i]!)) continue;
      if (inside(p, polys[j]!) && (best < 0 || Math.abs(area[j]!) < Math.abs(area[best]!))) best = j;
    }
    return best;
  });
  const depth = (i: number): number => (parent[i]! < 0 ? 0 : 1 + depth(parent[i]!));
  const isHole = polys.map((_, i) => {
    const pa = parent[i]!;
    if (pa < 0) return false;
    if (evenOdd) return depth(i) % 2 === 1;
    return Math.sign(area[i]!) !== Math.sign(area[pa]!) && !isHoleNZ(pa);
  });
  function isHoleNZ(j: number): boolean {
    const pa = parent[j]!;
    return pa >= 0 && Math.sign(area[j]!) !== Math.sign(area[pa]!);
  }
  const out: { pts: Point[]; holes: Point[][] }[] = [];
  polys.forEach((p, i) => {
    if (isHole[i]) return;
    out.push({ pts: p, holes: polys.filter((_, k) => isHole[k] && parent[k] === i) });
  });
  return out;
}

/** Parcourt l'arbre SVG et renvoie les formes remplies, dans l'ordre du document (= ordre de pose). */
export function readSvg(root: SvgNode): SvgReadResult {
  const vb = numbers(root.getAttribute('viewBox') ?? '');
  const wmm = lengthMM(root.getAttribute('width'));
  const hmm = lengthMM(root.getAttribute('height'));
  let base: Matrix = IDENTITY;
  let mmPerUnit: number | null = null;
  if (vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) {
    base = [1, 0, 0, 1, -vb[0]!, -vb[1]!];
    if (wmm) mmPerUnit = wmm / vb[2]!;
    else if (hmm) mmPerUnit = hmm / vb[3]!;
  } else if (root.getAttribute('width')) mmPerUnit = wmm && num(root, 'width') ? wmm / num(root, 'width') : null;
  const tol = vb.length === 4 ? Math.max(vb[2]!, vb[3]!) / 2000 : 0.5;

  const shapes: SvgShape[] = [];
  const lines: Point[][] = [];
  let skipped = 0;
  const walk = (n: SvgNode, m: Matrix, style: Record<string, string>, label: string | null) => {
    const tag = n.tagName.replace(/^svg:/, '');
    if (SKIP.has(tag)) return;
    const st = readStyle(n, style);
    if (st['display'] === 'none' || st['visibility'] === 'hidden' || st['opacity'] === '0') return;
    const mm = multiply(m, parseTransform(n.getAttribute('transform')));
    const own = n.getAttribute('inkscape:label') ?? n.getAttribute('id');
    const lb = own && !/^(path|rect|circle|ellipse|g|layer|polygon)[-_]?\d+$/i.test(own) ? own : label;
    if (tag === 'svg' || tag === 'g' || tag === 'a' || tag === 'switch') {
      for (const c of n.children) walk(c, mm, st, lb);
      return;
    }
    const fillAttr = st['fill'];
    // couleur par défaut du SVG : noir si rien n'est précisé
    const fill = fillAttr === undefined ? '#000000' : parseColor(fillAttr);
    const polys = outlines(n, tol).map((o) => o.map((p) => apply(mm, p)));
    const stroke = parseColor(st['stroke']);
    if (fill || stroke) lines.push(...polys.filter((q) => q.length >= 2));
    if (!fill) {
      skipped += polys.length;
      return;
    }
    if (tag === 'line') return;
    for (const s of groupHoles(polys, st['fill-rule'] === 'evenodd')) {
      if (shapes.length >= MAX_SHAPES) {
        skipped++;
        continue;
      }
      shapes.push({ ...s, fill, label: lb });
    }
  };
  walk(root, base, {}, null);

  // ignorer les miettes (moins de 1/10 000 de la surface du dessin)
  const all = shapes.length ? shapes.flatMap((s) => s.pts) : lines.flat();
  const box = all.length ? bbox(all) : ([0, 0, vb[2] ?? 1, vb[3] ?? 1] as [number, number, number, number]);
  const drawArea = Math.max(1e-9, (box[2] - box[0]) * (box[3] - box[1]));
  const kept = shapes.filter((s) => shapeArea(s) > drawArea * 1e-4);
  skipped += shapes.length - kept.length;
  return { shapes: kept, box, mmPerUnit, skipped, lines };
}

/** Surface d'une forme, évidements déduits (unités SVG²). */
export function shapeArea(s: Pick<SvgShape, 'pts' | 'holes'>): number {
  return Math.abs(signedArea(s.pts)) - s.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
}

/** Rôle d'une forme du dessin à l'import. */
export const IMPORT_ROLES = ['motif', 'trou', 'plaque', 'ignorer'] as const;
export type ImportRole = (typeof IMPORT_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<ImportRole, string>> = {
  motif: 'Paille',
  trou: 'Trou',
  plaque: 'Plaque',
  ignorer: 'Ignorer',
};

/**
 * Rôles proposés : la forme la plus en arrière qui couvre presque tout le dessin est la plaque
 * (le contour du panneau), tout le reste est de la paille.
 */
export function guessRoles(r: SvgReadResult): ImportRole[] {
  const drawArea = Math.max(1e-9, (r.box[2] - r.box[0]) * (r.box[3] - r.box[1]));
  const plate = r.shapes.findIndex((s) => {
    const b = bbox(s.pts);
    return ((b[2] - b[0]) * (b[3] - b[1])) / drawArea > 0.92 && shapeArea(s) / drawArea > 0.6;
  });
  return r.shapes.map((_, i) => (i === plate && r.shapes.length > 1 ? 'plaque' : 'motif'));
}

/** Forme simplifiée, évidements raccordés, dans la limite de points d'une zone. */
function outline(abs: Point[], holes: Point[][], maxPoints: number): Point[] {
  const clean = (q: Point[]) => {
    const f = q[0];
    const l = q[q.length - 1];
    return f && l && q.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6 ? q.slice(0, -1) : q;
  };
  const keep = holes.slice(0, 12);
  let budget = maxPoints;
  for (let pass = 0; pass < 6; pass++) {
    const outer = simplify(clean(abs), Math.max(8, Math.round(budget * (keep.length ? 0.6 : 1))));
    const hs = keep.map((h) => simplify(clean(h), Math.max(6, Math.round((budget * 0.4) / Math.max(1, keep.length)))));
    const ring = hs.length ? bridgeHoles(outer, hs.filter((h) => h.length >= 3)) : outer;
    if (ring.length <= MAX_ZONE_POINTS) return ring;
    budget *= 0.7;
  }
  return simplify(clean(abs), maxPoints);
}

const MAX_ZONE_POINTS = 300;

export interface SvgImportOptions {
  /** Largeur en mm du dessin une fois posé. */
  width: number;
  /** Coin haut-gauche du dessin sur le panneau (mm). */
  x: number;
  y: number;
  /** Sens du fil par défaut. */
  angle: number;
  /** Couleur unique si on ne garde pas les couleurs du fichier. */
  color: StrawColor | 'auto';
  /** En mode auto : paille choisie pour chaque couleur du fichier (#rrggbb). */
  mapping?: Readonly<Record<string, StrawColor>>;
  /** Points max par contour. */
  maxPoints: number;
  /** Rôle de chaque forme (même ordre que r.shapes) ; absent = paille. */
  roles?: readonly ImportRole[];
}

export interface ImportPlan {
  zones: Zone[];
  /** Dimensions données par la plaque, si une forme a ce rôle. */
  panel: Panel | null;
  /** Contour de chaque forme une fois posée (mm, non simplifié), pour l'aperçu et la sélection. */
  outlines: Point[][];
}

/**
 * Convertit les formes lues. Avec une plaque : elle devient le panneau (sa boîte, à la largeur demandée)
 * et le dessin est calé dessus. Sans plaque : le dessin est posé en (x, y) à la largeur demandée.
 */
export function planImport(r: SvgReadResult, o: SvgImportOptions, startId: number): ImportPlan {
  const roles = o.roles ?? [];
  const plateIdx = roles.indexOf('plaque');
  const plate = plateIdx >= 0 ? r.shapes[plateIdx] : undefined;
  const ref = plate ? bbox(plate.pts) : r.box;
  const k = o.width / Math.max(1e-9, ref[2] - ref[0]);
  const ox = plate ? 0 : o.x;
  const oy = plate ? 0 : o.y;
  const map = (q: Point[]) => q.map(([x, y]): Point => [ox + (x - ref[0]) * k, oy + (y - ref[1]) * k]);
  const zones: Zone[] = [];
  const count = new Map<string, number>();
  const outlines = r.shapes.map((s) => map(s.pts));
  r.shapes.forEach((s, i) => {
    const role = roles[i] ?? 'motif';
    if (role === 'plaque' || role === 'ignorer') return;
    const pts = outline(map(s.pts), s.holes.map(map), o.maxPoints);
    if (pts.length < 3) return;
    const hole = role === 'trou';
    const fill = s.fill ?? '#d6b25c';
    const color = hole ? 'naturel' : o.color === 'auto' ? (o.mapping?.[fill] ?? nearestStraw(fill)) : o.color;
    const base = (s.label ?? (hole ? 'Trou' : strawInfo(color).label)).slice(0, 34);
    const n = (count.get(base) ?? 0) + 1;
    count.set(base, n);
    const z: Zone = {
      id: startId + zones.length,
      ...polyZone(pts),
      name: n > 1 ? `${base} ${n}` : base,
      color,
      angle: o.angle,
      hole,
    };
    if (hole) z.edge = { type: 'droit', size: 2 };
    zones.push(z);
  });
  let panel: ImportPlan['panel'] = null;
  if (plate) {
    const w = Math.max(1, Math.round((ref[2] - ref[0]) * k));
    const h = Math.max(1, Math.round((ref[3] - ref[1]) * k));
    panel = plateToPanel(map(plate.pts), w, h);
    // les creux de la plaque sont des découpes
    plate.holes.forEach((hh, i) => {
      const pts = outline(map(hh), [], o.maxPoints);
      if (pts.length < 3) return;
      zones.push({ id: startId + zones.length, ...polyZone(pts), name: `Creux de la plaque ${i + 1}`, color: 'naturel', angle: o.angle, hole: true, edge: { type: 'droit', size: 2 } });
    });
  }
  return { zones, panel, outlines };
}

/** Raccourci sans rôles : toutes les formes deviennent de la paille. */
export function svgToZones(r: SvgReadResult, o: SvgImportOptions, startId: number): Zone[] {
  return planImport(r, o, startId).zones;
}

/** Couleurs distinctes trouvées dans le fichier, avec la paille proposée. */
export function colorMapping(r: SvgReadResult): { fill: string; straw: StrawColor; count: number }[] {
  const m = new Map<string, number>();
  for (const s of r.shapes) if (s.fill) m.set(s.fill, (m.get(s.fill) ?? 0) + 1);
  return [...m].map(([fill, count]) => ({ fill, straw: nearestStraw(fill), count })).sort((a, b) => b.count - a.count);
}
