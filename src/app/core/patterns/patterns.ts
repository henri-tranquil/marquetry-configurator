import { bbox, RAD } from '../geometry/geometry';
import { Point, Project, StrawColor, Zone } from '../model/project';

export type PatternType = 'soleil' | 'bandes' | 'damier' | 'losanges';
export type SunOrigin = 'bas' | 'centre' | 'coin' | 'haut';
export type BandDir = 'v' | 'h';

export interface PatternOptions {
  type: PatternType;
  count: number;
  /** Origine du soleil ou direction des bandes. */
  option?: string;
  colorA: StrawColor;
  colorB: StrawColor;
  angleA: number;
  angleB: number;
}

export interface PatternMeta {
  label: string;
  def: number;
  min: number;
  max: number;
  options?: readonly { value: string; label: string }[];
  /** Le soleil calcule lui-même le sens de chaque rayon. */
  usesAngles: boolean;
  note: string;
  item: string;
}

export const PATTERNS: Readonly<Record<PatternType, PatternMeta>> = {
  soleil: {
    label: 'Soleil (rayons)',
    def: 12,
    min: 3,
    max: 48,
    options: [
      { value: 'bas', label: 'Bas, centre' },
      { value: 'centre', label: 'Centre' },
      { value: 'coin', label: 'Coin bas gauche' },
      { value: 'haut', label: 'Haut, centre' },
    ],
    usesAngles: false,
    note: "Chaque rayon prend le fil dans son axe : c'est ce qui fait tourner les reflets.",
    item: 'Rayon',
  },
  bandes: {
    label: 'Bandes alternées',
    def: 8,
    min: 2,
    max: 48,
    options: [
      { value: 'v', label: 'Verticales' },
      { value: 'h', label: 'Horizontales' },
    ],
    usesAngles: true,
    note: 'Sens 45° et 135° donnent un chevron.',
    item: 'Bande',
  },
  damier: {
    label: 'Damier',
    def: 6,
    min: 2,
    max: 16,
    usesAngles: true,
    note: "Astuce : même couleur en A et B, sens 0° et 90°. Le damier n'apparaît que par la lumière.",
    item: 'Case',
  },
  losanges: {
    label: 'Losanges',
    def: 5,
    min: 2,
    max: 14,
    usesAngles: true,
    note: 'Deux familles de losanges imbriqués, une par couleur et par sens.',
    item: 'Losange',
  },
};

type ZoneDraft = Omit<Zone, 'id' | 'name' | 'rot' | 'hole'> & { rot?: number };

/** Zone 'poly' dont les points sont normalisés dans sa boîte. */
export function polyZone(abs: readonly Point[]): Pick<Zone, 'type' | 'x' | 'y' | 'w' | 'h' | 'rot' | 'pts'> {
  const [a, b, c, d] = bbox(abs);
  const w = Math.max(c - a, 0.1);
  const h = Math.max(d - b, 0.1);
  const x = (a + c) / 2;
  const y = (b + d) / 2;
  return { type: 'poly', x, y, w, h, rot: 0, pts: abs.map(([px, py]) => [(px - x) / w, (py - y) / h]) };
}

/**
 * Génère des zones ordinaires. Les ids partent de startId.
 * Les secteurs du soleil débordent volontairement du panneau.
 */
export function generatePattern(
  o: PatternOptions,
  panel: Project['panel'],
  startId: number,
): Zone[] {
  const { w, h } = panel;
  const meta = PATTERNS[o.type];
  const n = Math.min(meta.max, Math.max(meta.min, Math.round(o.count)));
  const { colorA: A, colorB: B, angleA: aA, angleB: aB } = o;
  const out: ZoneDraft[] = [];

  if (o.type === 'bandes') {
    for (let i = 0; i < n; i++) {
      const k = i % 2;
      const geom =
        o.option === 'h'
          ? { x: w / 2, y: ((i + 0.5) * h) / n, w, h: h / n }
          : { x: ((i + 0.5) * w) / n, y: h / 2, w: w / n, h };
      out.push({ type: 'rect', ...geom, color: k ? B : A, angle: k ? aB : aA });
    }
  } else if (o.type === 'soleil') {
    const anchors: Record<SunOrigin, [number, number, number, number]> = {
      bas: [w / 2, h, 180, 180],
      centre: [w / 2, h / 2, -90, 360],
      coin: [0, h, 270, 90],
      haut: [w / 2, 0, 0, 180],
    };
    const [cx, cy, st, sp] = anchors[(o.option as SunOrigin) ?? 'bas'] ?? anchors.bas;
    const R = Math.hypot(w, h) * 1.15;
    const da = sp / n;
    const pt = (a: number, r: number): Point => [cx + r * Math.cos(a * RAD), cy + r * Math.sin(a * RAD)];
    for (let i = 0; i < n; i++) {
      const a0 = st + i * da;
      const am = a0 + da / 2;
      const a1 = a0 + da;
      out.push({
        ...polyZone([[cx, cy], pt(a0, R), pt(am, R / Math.cos((da / 2) * RAD)), pt(a1, R)]),
        color: i % 2 ? B : A,
        // le fil suit la bissectrice du rayon
        angle: Math.round(((am % 180) + 180) % 180) % 180,
      });
    }
  } else if (o.type === 'damier') {
    const ny = Math.min(40, Math.max(1, Math.round((n * h) / w)));
    const cw = w / n;
    const ch = h / ny;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < n; i++) {
        const k = (i + j) % 2;
        out.push({
          type: 'rect',
          x: (i + 0.5) * cw,
          y: (j + 0.5) * ch,
          w: cw,
          h: ch,
          color: k ? B : A,
          angle: k ? aB : aA,
        });
      }
  } else {
    const ny = Math.min(30, Math.max(1, Math.round((n * h) / w)));
    const cw = w / n;
    const ch = h / ny;
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= n; i++)
        out.push({ type: 'diamond', x: i * cw, y: j * ch, w: cw, h: ch, color: A, angle: aA });
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < n; i++)
        out.push({
          type: 'diamond',
          x: (i + 0.5) * cw,
          y: (j + 0.5) * ch,
          w: cw,
          h: ch,
          color: B,
          angle: aB,
        });
  }

  return out.map((z, i) => ({
    id: startId + i,
    name: `${meta.item} ${i + 1}`,
    hole: false,
    ...z,
    rot: z.rot ?? 0,
  }));
}

/**
 * Insère un motif. replace = true : remplace les formes (les trous restent).
 * Les trous restent toujours en fin de liste.
 */
export function insertPattern(zones: readonly Zone[], pattern: Zone[], replace: boolean): Zone[] {
  const holes = zones.filter((z) => z.hole);
  return replace ? [...pattern, ...holes] : [...zones.filter((z) => !z.hole), ...pattern, ...holes];
}
