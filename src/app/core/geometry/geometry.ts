import { EdgeProfile, Point, Project, ShapeType, Zone } from '../model/project';

export const RAD = Math.PI / 180;

/** [xmin, ymin, xmax, ymax] */
export type BBox = [number, number, number, number];

function regular(n: number, phase = 0): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < n; k++) {
    const a = phase + (k * 2 * Math.PI) / n;
    out.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]);
  }
  return out;
}

/** Points unitaires (dans [-0.5, 0.5]) de chaque forme, sauf 'poly' qui porte les siens. */
export const UNIT_SHAPES: Readonly<Record<Exclude<ShapeType, 'poly'>, readonly Point[]>> = {
  rect: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ],
  tri: [
    [0, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ],
  diamond: [
    [0, -0.5],
    [0.5, 0],
    [0, 0.5],
    [-0.5, 0],
  ],
  hex: regular(6),
  ellipse: regular(72),
};

/** Polygone monde : unitaires × (w, h), rotation, translation. */
export function zonePolygon(z: Zone): Point[] {
  const unit = z.type === 'poly' ? (z.pts ?? []) : UNIT_SHAPES[z.type];
  const r = z.rot * RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return unit.map(([a, b]) => {
    const x = a * z.w;
    const y = b * z.h;
    return [z.x + x * c - y * s, z.y + x * s + y * c];
  });
}

export function bbox(p: readonly Point[]): BBox {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const [x, y] of p) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

export function pointInPolygon(p: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i] as Point;
    const [xj, yj] = p[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function signedArea(p: readonly Point[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i] as Point;
    const [xj, yj] = p[j] as Point;
    a += xj * yi - xi * yj;
  }
  return a / 2;
}

export function perimeter(p: readonly Point[]): number {
  let l = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as Point;
    const b = p[(i + 1) % p.length] as Point;
    l += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return l;
}

/* ---------- zones préparées ---------- */

export interface PreparedZone {
  zone: Zone;
  poly: Point[];
  box: BBox;
}

export interface Prepared {
  /** Zones pleines, dans l'ordre de pose. */
  zones: PreparedZone[];
  /** Trous, appliqués après toutes les zones. */
  holes: PreparedZone[];
}

export function prepare(zones: readonly Zone[]): Prepared {
  const all = zones.map((zone) => {
    const poly = zonePolygon(zone);
    return { zone, poly, box: bbox(poly) };
  });
  return { zones: all.filter((o) => !o.zone.hole), holes: all.filter((o) => o.zone.hole) };
}

export function hitPrepared(o: PreparedZone, x: number, y: number): boolean {
  const [x0, y0, x1, y1] = o.box;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && pointInPolygon(o.poly, x, y);
}

/** Ce qui est visible en (x, y) : un trou, la zone du dessus, ou rien (le fond). */
export function topAt(D: Prepared, x: number, y: number): Zone | 'hole' | null {
  if (D.holes.some((o) => hitPrepared(o, x, y))) return 'hole';
  for (let i = D.zones.length - 1; i >= 0; i--) {
    const o = D.zones[i] as PreparedZone;
    if (hitPrepared(o, x, y)) return o.zone;
  }
  return null;
}

/** Forme sous le pointeur pour la sélection : trous d'abord, clics hors panneau ignorés. */
export function pickAt(
  D: Prepared,
  panel: Project['panel'],
  x: number,
  y: number,
): Zone | null {
  if (x < 0 || y < 0 || x > panel.w || y > panel.h) return null;
  for (let i = D.holes.length - 1; i >= 0; i--) {
    const o = D.holes[i] as PreparedZone;
    if (hitPrepared(o, x, y)) return o.zone;
  }
  for (let i = D.zones.length - 1; i >= 0; i--) {
    const o = D.zones[i] as PreparedZone;
    if (hitPrepared(o, x, y)) return o.zone;
  }
  return null;
}

/** Point réellement visible de la zone pour y poser son numéro de pose. */
export function labelPoint(D: Prepared, o: PreparedZone, panel: Project['panel']): Point | null {
  const { w, h } = panel;
  const z = o.zone;
  if (z.x > 0 && z.x < w && z.y > 0 && z.y < h && topAt(D, z.x, z.y) === z) return [z.x, z.y];
  const x0 = Math.max(0, o.box[0]);
  const x1 = Math.min(w, o.box[2]);
  const y0 = Math.max(0, o.box[1]);
  const y1 = Math.min(h, o.box[3]);
  if (x1 <= x0 || y1 <= y0) return null;
  const v: Point[] = [];
  for (let i = 1; i < 10; i++)
    for (let j = 1; j < 10; j++) {
      const x = x0 + ((x1 - x0) * i) / 10;
      const y = y0 + ((y1 - y0) * j) / 10;
      if (topAt(D, x, y) === z) v.push([x, y]);
    }
  if (!v.length) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of v) {
    mx += x / v.length;
    my += y / v.length;
  }
  let best = v[0] as Point;
  for (const p of v)
    if (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(best[0] - mx, best[1] - my)) best = p;
  return best;
}

/**
 * La forme déborde-t-elle largement du panneau (secteurs du soleil) ?
 * Ces formes ne servent ni de repère d'aimantation ni de support de poignées.
 */
export function overflowsPanel(box: BBox, panel: Project['panel']): boolean {
  const area = (box[2] - box[0]) * (box[3] - box[1]);
  const w = Math.min(box[2], panel.w) - Math.max(box[0], 0);
  const h = Math.min(box[3], panel.h) - Math.max(box[1], 0);
  const inside = w > 0 && h > 0 ? w * h : 0;
  return area > 1.5 * inside + 1e-9;
}

/**
 * Polygone évidé → contour unique « en trou de serrure » : chaque trou est relié au contour extérieur
 * par une couture aller-retour de largeur nulle. Remplissage, point-in-polygon et aire restent justes.
 */
export function bridgeHoles(outer: readonly Point[], holes: readonly (readonly Point[])[]): Point[] {
  let ring: Point[] = [...outer];
  const sign = Math.sign(signedArea(outer)) || 1;
  // trous traités de droite à gauche : les coutures ne se croisent pas dans les cas courants
  const sorted = holes
    .filter((h) => h.length >= 3)
    .map((h) => (Math.sign(signedArea(h)) === sign ? [...h].reverse() : [...h]))
    .sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])));
  for (const h of sorted) {
    let hi = 0;
    for (let k = 1; k < h.length; k++) if (h[k]![0] > h[hi]![0]) hi = k;
    const hp = h[hi]!;
    let oi = 0;
    let best = Infinity;
    for (let k = 0; k < ring.length; k++) {
      const q = ring[k]!;
      const d = (q[0] - hp[0]) ** 2 + (q[1] - hp[1]) ** 2 + (q[0] < hp[0] ? 1e12 : 0);
      if (d < best) {
        best = d;
        oi = k;
      }
    }
    const loop: Point[] = [...h.slice(hi), ...h.slice(0, hi), hp];
    ring = [...ring.slice(0, oi + 1), ...loop, ring[oi]!, ...ring.slice(oi + 1)];
  }
  return ring;
}

/** Moins de 3 brins de large. */
export function isNarrow(z: Zone, sw: number): boolean {
  return !z.hole && z.type !== 'poly' && Math.min(z.w, z.h) < 3 * sw;
}

export function panelPolygon(panel: Project['panel']): Point[] {
  return [
    [0, 0],
    [panel.w, 0],
    [panel.w, panel.h],
    [0, panel.h],
  ];
}

/* ---------- profils ---------- */

export interface EdgeInfo {
  /** Normale de chaque arête, orientée vers le vide. */
  en: Point[];
  /** Direction d'onglet à chaque sommet + facteur de longueur (borné à 1/0,35). */
  vm: [number, number, number][];
  /** Sommet lisse (angle entre arêtes < 35°). */
  sm: boolean[];
}

/**
 * Normales et onglets d'un contour.
 * matIn = true : la matière est à l'intérieur (contour du panneau) ; false : c'est un trou.
 * Les directions pointent vers la matière, donc offsetPolygon(d > 0) rentre dans la matière.
 */
export function edgeInfo(p: readonly Point[], matIn: boolean): EdgeInfo {
  const n = p.length;
  const sg = (signedArea(p) > 0 ? 1 : -1) * (matIn ? 1 : -1);
  const en: Point[] = [];
  const vm: [number, number, number][] = [];
  const sm: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[i] as Point;
    const b = p[(i + 1) % n] as Point;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    en.push([(-dy / l) * sg, (dx / l) * sg]);
  }
  const cos35 = Math.cos(35 * RAD);
  for (let i = 0; i < n; i++) {
    const a = en[(i - 1 + n) % n] as Point;
    const b = en[i] as Point;
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const l = Math.hypot(mx, my);
    if (l < 1e-6) {
      mx = b[0];
      my = b[1];
    } else {
      mx /= l;
      my /= l;
    }
    vm.push([mx, my, 1 / Math.max(0.35, mx * b[0] + my * b[1])]);
    sm.push(a[0] * b[0] + a[1] * b[1] > cos35);
  }
  return { en, vm, sm };
}

export function offsetPolygon(p: readonly Point[], info: EdgeInfo, d: number): Point[] {
  return p.map((q, i) => {
    const [mx, my, f] = info.vm[i] as [number, number, number];
    return [q[0] + mx * f * d, q[1] + my * f * d];
  });
}

/** Rayon effectif d'un profil : min(size, thick − 0,5), 0 si droit. */
export function profileRadius(e: EdgeProfile | undefined, thick: number): number {
  return e && e.type !== 'droit' ? Math.min(e.size, thick - 0.5) : 0;
}

/** Longueur développée du profil (ce que la paille doit couvrir). */
export function arcLength(e: EdgeProfile, r: number): number {
  if (e.type === 'arrondi') return (Math.PI * r) / 2;
  if (e.type === 'chanfrein') return Math.SQRT2 * r;
  return 0;
}

export interface ProfileStep {
  /** Retrait depuis le bord, dans le plan. */
  d: number;
  /** Profondeur (≤ 0). */
  z: number;
  /** Angle du profil en radians (0 en façade, π/2 sur la paroi). */
  t: number;
}

/** Échantillonnage du profil, de la façade vers la paroi. */
export function profileSteps(e: EdgeProfile, r: number): ProfileStep[] {
  if (!r) return [{ d: 0, z: 0, t: 0 }];
  if (e.type === 'chanfrein')
    return [
      { d: r, z: 0, t: 45 * RAD },
      { d: 0, z: -r, t: 45 * RAD },
    ];
  const out: ProfileStep[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = ((k / 8) * Math.PI) / 2;
    out.push({ d: r * (1 - Math.sin(t)), z: -r * (1 - Math.cos(t)), t });
  }
  return out;
}

export interface ProfileBand {
  poly: Point[];
  matIn: boolean;
  r: number;
}

/** Bandes de profil à dessiner : le chant du panneau puis chaque trou profilé. */
export function profileBands(p: Project, D: Prepared): ProfileBand[] {
  const bands: ProfileBand[] = [];
  const rO = profileRadius(p.edge, p.thick);
  if (rO) bands.push({ poly: panelPolygon(p.panel), matIn: true, r: rO });
  for (const o of D.holes) {
    const r = profileRadius(o.zone.edge, p.thick);
    if (r) bands.push({ poly: o.poly, matIn: false, r });
  }
  return bands;
}

/* ---------- divers ---------- */

/** Angle de fil ramené dans [0, 180). */
export function normAngle(a: number): number {
  return ((Math.round(a) % 180) + 180) % 180;
}

export function round05(v: number): number {
  return Math.round(v * 2) / 2;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

/** Générateur pseudo-aléatoire déterministe (Park–Miller), même suite que le prototype. */
export function rng(seed: number): () => number {
  let s = ((Math.abs(Math.floor(seed)) * 7919 + 13) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
