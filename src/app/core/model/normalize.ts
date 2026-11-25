import { generatePattern } from '../patterns/patterns';
import {
  EdgeProfile,
  FILL_TYPES,
  StrawFill,
  LIMITS,
  isCustomColor,
  PALETTE,
  Point,
  PROFILE_TYPES,
  Project,
  SHAPE_NAMES,
  ShapeType,
  StrawColor,
  Zone,
} from './project';

type Loose = Record<string, unknown> | null | undefined;

function obj(v: unknown): Loose {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Nombre borné, valeur par défaut si absent ou non fini. */
function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

function color(v: unknown): StrawColor {
  if (typeof v !== 'string') return 'naturel';
  if (Object.hasOwn(PALETTE, v)) return v as StrawColor;
  const hex = v.trim().toLowerCase();
  return isCustomColor(hex) ? hex : 'naturel';
}

function isShape(v: unknown): v is ShapeType {
  return typeof v === 'string' && Object.hasOwn(SHAPE_NAMES, v);
}

export function normalizeEdge(v: unknown): EdgeProfile {
  const e = obj(v);
  const type = PROFILE_TYPES.find((t) => t === e?.['type']) ?? 'droit';
  const [a, b] = LIMITS.profileSize;
  return { type, size: num(e?.['size'], 5, a, b) };
}

export function normalizeFill(v: unknown): StrawFill | undefined {
  const f = obj(v);
  if (!f) return undefined;
  const type = FILL_TYPES.find((t) => t === f['type']) ?? 'parallele';
  const [c0, c1] = LIMITS.fillCenter;
  return {
    type,
    cx: num(f['cx'], 0, c0, c1),
    cy: num(f['cy'], type === 'eventail' ? 0.5 : 0, c0, c1),
    open: num(f['open'], 45, ...LIMITS.chevronOpen),
    band: num(f['band'], 20, ...LIMITS.chevronBand),
  };
}

function normalizeZone(v: unknown, id: number): Zone | null {
  const z = obj(v);
  if (!z || !isShape(z['type'])) return null;
  const type = z['type'];
  const [a0, a1] = LIMITS.angle;
  const rawName = z['name'];
  const t: Zone = {
    id,
    type,
    name: String(typeof rawName === 'string' && rawName ? rawName : SHAPE_NAMES[type]).slice(
      0,
      LIMITS.nameLength,
    ),
    x: num(z['x'], 0, -2e4, 2e4),
    y: num(z['y'], 0, -2e4, 2e4),
    w: num(z['w'], 50, 0.1, 3e4),
    h: num(z['h'], 50, 0.1, 3e4),
    rot: num(z['rot'], 0, -360, 360),
    color: color(z['color']),
    angle: num(z['angle'], 0, a0, a1),
    hole: !!z['hole'],
  };
  if (t.hole) t.edge = normalizeEdge(z['edge']);
  const fill = normalizeFill(z['fill']);
  if (fill) t.fill = fill;
  if (type === 'poly') {
    const raw = Array.isArray(z['pts']) ? (z['pts'] as unknown[]) : [];
    const pts: Point[] = raw
      .filter((q): q is unknown[] => Array.isArray(q) && q.length === 2)
      .slice(0, LIMITS.maxPolyPoints)
      .map((q) => [num(q[0], 0, -1, 1), num(q[1], 0, -1, 1)]);
    if (pts.length < 3) return null;
    t.pts = pts;
  }
  return t;
}

/**
 * Toute donnée entrante (localStorage, import) passe ici : nombres bornés,
 * couleurs et types inconnus remplacés, ids réattribués à partir de 1.
 */
export function normalizeProject(input: unknown): Project {
  const o = obj(input);
  const panel = obj(o?.['panel']);
  const bg = obj(o?.['bg']);
  const L = LIMITS;
  const view = o?.['view'];
  const p: Project = {
    panel: {
      w: num(panel?.['w'], 400, ...L.panel),
      h: num(panel?.['h'], 700, ...L.panel),
      ...(panel?.['round'] === true ? { round: true } : {}),
    },
    bg: {
      mode: bg?.['mode'] === 'paille' ? 'paille' : 'bois',
      color: color(bg?.['color']),
      angle: num(bg?.['angle'], 90, ...L.angle),
    },
    sw: num(o?.['sw'], 4, ...L.sw),
    irr: num(o?.['irr'], 0.5, ...L.irr),
    light: num(o?.['light'], 35, ...L.light),
    contrast: num(o?.['contrast'], 0.7, ...L.contrast),
    elev: num(o?.['elev'], 30, ...L.elev),
    thick: num(o?.['thick'], 18, ...L.thick),
    edge: normalizeEdge(o?.['edge']),
    gloss: num(o?.['gloss'], 0.55, ...L.gloss),
    view: view === 'plan' || view === '3d' ? view : 'rendu',
    zones: [],
  };
  const raw = Array.isArray(o?.['zones']) ? (o['zones'] as unknown[]) : [];
  for (const v of raw.slice(0, L.maxZones)) {
    const z = normalizeZone(v, p.zones.length + 1);
    if (z) p.zones.push(z);
  }
  return p;
}

/** Vérifie qu'un objet importé ressemble à un projet avant de le normaliser. */
export function looksLikeProject(v: unknown): boolean {
  return !!obj(obj(v)?.['panel']);
}

/** Projet de départ : porte de buffet en soleil, chant arrondi 4 mm, prise de main percée. */
/** Point de départ : panneau en médium nu, sans aucune forme. */
export function blankProject(panel: Project['panel'] = { w: 400, h: 700 }): Project {
  return normalizeProject({ panel, bg: { mode: 'bois', color: 'naturel', angle: 90 }, zones: [] });
}

export function exampleProject(): Project {
  const p = normalizeProject({
    panel: { w: 400, h: 700 },
    bg: { mode: 'paille', color: 'naturel', angle: 90 },
    sw: 4,
    irr: 0.5,
    light: 35,
    contrast: 0.7,
  });
  const zones = generatePattern(
    { type: 'soleil', count: 12, option: 'bas', colorA: 'naturel', colorB: 'ble', angleA: 0, angleB: 0 },
    p.panel,
    1,
  );
  let id = zones.length + 1;
  zones.push(
    { id: id++, type: 'ellipse', name: 'Soleil levant', x: 200, y: 672, w: 170, h: 170, rot: 0, color: 'miel', angle: 0, hole: false },
    { id: id++, type: 'rect', name: 'Plinthe', x: 200, y: 689, w: 400, h: 22, rot: 0, color: 'brule', angle: 0, hole: false },
    {
      id,
      type: 'ellipse',
      name: 'Prise de main',
      x: 352,
      y: 330,
      w: 26,
      h: 26,
      rot: 0,
      color: 'naturel',
      angle: 0,
      hole: true,
      edge: { type: 'arrondi', size: 6 },
    },
  );
  return { ...p, edge: { type: 'arrondi', size: 4 }, zones };
}
