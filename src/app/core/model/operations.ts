import { clamp } from '../geometry/geometry';
import { LIMITS, Project, SHAPE_NAMES, ShapeType, Zone } from './project';

export type AddKind = Exclude<ShapeType, 'poly'> | 'hole-round' | 'hole-slot';

export function nextId(zones: readonly Zone[]): number {
  let m = 0;
  for (const z of zones) if (z.id > m) m = z.id;
  return m + 1;
}

/** Nouvelle forme centrée sur le panneau. */
export function newShape(kind: AddKind, p: Project, id: number): Zone {
  const { w, h } = p.panel;
  const m = Math.min(w, h);
  const base = { id, x: w / 2, y: h / 2, rot: 0, color: 'miel' as const, angle: 45 };
  if (kind === 'hole-round') {
    const d = Math.min(30, m * 0.3);
    return { ...base, type: 'ellipse', name: 'Trou rond', w: d, h: d, hole: true, edge: { type: 'arrondi', size: 5 } };
  }
  if (kind === 'hole-slot')
    return {
      ...base,
      type: 'rect',
      name: 'Trou oblong',
      w: Math.min(90, w * 0.4),
      h: Math.min(22, h * 0.15),
      hole: true,
      edge: { type: 'arrondi', size: 5 },
    };
  const sw = m * 0.4;
  const sh = kind === 'tri' ? m * 0.35 : kind === 'hex' ? sw * 0.866 : sw;
  return {
    ...base,
    type: kind,
    name: `${SHAPE_NAMES[kind]} ${p.zones.length + 1}`,
    w: sw,
    h: sh,
    hole: false,
  };
}

/**
 * Nouvelles dimensions : positions et tailles mises à l'échelle,
 * sauf la taille des trous (un perçage garde sa cote).
 */
export function resizePanel(p: Project, w: number, h: number): Project {
  const [a, b] = LIMITS.panel;
  const nw = clamp(Math.round(w), a, b);
  const nh = clamp(Math.round(h), a, b);
  if (!Number.isFinite(nw) || !Number.isFinite(nh)) return p;
  if (nw === p.panel.w && nh === p.panel.h) return p;
  const sx = nw / p.panel.w;
  const sy = nh / p.panel.h;
  return {
    ...p,
    panel: { w: nw, h: nh },
    zones: p.zones.map((z) => ({
      ...z,
      x: z.x * sx,
      y: z.y * sy,
      ...(z.hole ? {} : { w: z.w * sx, h: z.h * sy }),
    })),
  };
}

export function duplicateZone(z: Zone, id: number): Zone {
  return {
    ...structuredClone(z),
    id,
    x: z.x + 10,
    y: z.y + 10,
    name: `${z.name} copie`.slice(0, LIMITS.nameLength),
  };
}

/** Échange une zone avec sa voisine dans l'ordre de pose (+1 = passe devant). */
export function moveZone(zones: readonly Zone[], id: number, dir: 1 | -1): Zone[] {
  const i = zones.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= zones.length) return [...zones];
  const out = [...zones];
  [out[i], out[j]] = [out[j] as Zone, out[i] as Zone];
  return out;
}

/** Déplace une zone de l'index `from` à `to` (glisser-déposer des calques). */
export function reorderZone(zones: readonly Zone[], from: number, to: number): Zone[] {
  const out = [...zones];
  const [z] = out.splice(from, 1);
  if (!z) return [...zones];
  out.splice(clamp(to, 0, out.length), 0, z);
  return out;
}
