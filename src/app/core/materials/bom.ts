import { arcLength, insidePanel, perimeter, prepare, profileRadius, topAt } from '../geometry/geometry';
import { strawInfo, Project, StrawColor, WOOD_HEX } from '../model/project';

/** Chute ajoutée aux longueurs de bande. */
export const WASTE = 1.15;

export interface BomRow {
  key: StrawColor | 'bois';
  label: string;
  hex: string;
  /** Surface visible en mm². */
  area: number;
  /** Part de la surface du panneau, 0–1. */
  share: number;
  /** Mètres de bande, chute comprise (0 pour le médium). */
  meters: number;
}

export interface Bom {
  rows: BomRow[];
  /** Surface développée des profils en mm² (en plus de la face). */
  profileArea: number;
  profileMeters: number;
  totalMeters: number;
  panelArea: number;
  holeArea: number;
}

/** Mètres de bande pour une surface en mm². */
export function stripMeters(area: number, sw: number): number {
  return (area / sw / 1000) * WASTE;
}

export interface ZoneUsage {
  /** Surface réellement visible (mm²). */
  area: number;
  /** Mètres de bande, chute comprise. */
  meters: number;
}

/** Surface visible de chaque zone (échantillonnage plus fin que l'estimation globale). */
export function visibleAreas(p: Project, cells = 200): Map<number, ZoneUsage> {
  const { w, h } = p.panel;
  const st = Math.max(w, h) / cells;
  const D = prepare(p.zones);
  const counts = new Map<number, number>();
  for (let y = st / 2; y < h; y += st)
    for (let x = st / 2; x < w; x += st) {
      if (!insidePanel(p.panel, x, y)) continue;
      const t = topAt(D, x, y);
      if (t && t !== 'hole') counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    }
  const out = new Map<number, ZoneUsage>();
  for (const [id, n] of counts) {
    const area = n * st * st;
    out.set(id, { area, meters: stripMeters(area, p.sw) });
  }
  return out;
}

/** Estimation matière par échantillonnage (~120 cases dans la plus grande dimension). */
export function estimateMaterials(p: Project): Bom {
  const { w, h } = p.panel;
  const st = Math.max(w, h) / 120;
  const D = prepare(p.zones);
  const acc = new Map<StrawColor | 'bois', number>();
  let holes = 0;
  let total = 0;
  for (let y = st / 2; y < h; y += st)
    for (let x = st / 2; x < w; x += st) {
      if (!insidePanel(p.panel, x, y)) continue;
      total++;
      const t = topAt(D, x, y);
      if (t === 'hole') {
        holes++;
        continue;
      }
      const k = t ? t.color : p.bg.mode === 'paille' ? p.bg.color : 'bois';
      acc.set(k, (acc.get(k) ?? 0) + 1);
    }
  const panelArea = p.panel.round ? (Math.PI * w * h) / 4 : w * h;
  const cell = total ? panelArea / total : 0;
  const rows: BomRow[] = [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const area = count * cell;
      const wood = key === 'bois';
      return {
        key,
        label: wood ? 'Médium nu' : strawInfo(key).label,
        hex: wood ? WOOD_HEX : strawInfo(key).hex,
        area,
        share: total ? count / total : 0,
        meters: wood ? 0 : stripMeters(area, p.sw),
      };
    });

  let profileArea = 0;
  const rO = profileRadius(p.edge, p.thick);
  if (rO) profileArea += 2 * (w + h) * (arcLength(p.edge, rO) - rO);
  for (const o of D.holes) {
    const e = o.zone.edge;
    const r = profileRadius(e, p.thick);
    if (e && r) profileArea += perimeter(o.poly) * (arcLength(e, r) - r);
  }
  const profileMeters = stripMeters(profileArea, p.sw);
  return {
    rows,
    profileArea,
    profileMeters,
    totalMeters: rows.reduce((a, r) => a + r.meters, 0) + profileMeters,
    panelArea,
    holeArea: holes * cell,
  };
}
