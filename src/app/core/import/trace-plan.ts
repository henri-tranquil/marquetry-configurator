/**
 * Zones construites à la main à partir des cases d'un dessin au trait → zones du projet.
 * Une zone « plaque » donne le panneau (rond si son contour est une ellipse).
 */
import { bbox, BBox, signedArea } from '../geometry/geometry';
import { Panel, Point, StrawColor, Zone } from '../model/project';
import { polyZone } from '../patterns/patterns';
import { CellGrid, plateToPanel, shapeOutline, TracedShape, traceRegion } from './trace-cells';

export type TraceRole = 'plaque' | 'motif' | 'trou';

export const TRACE_ROLE_LABELS: Readonly<Record<TraceRole, string>> = {
  plaque: 'Plaque',
  motif: 'Paille',
  trou: 'Trou',
};

export interface TraceZone {
  id: number;
  name: string;
  role: TraceRole;
  color: StrawColor;
  /** Numéros des cases réunies. */
  cells: number[];
}

export interface TracePlanOptions {
  /** Largeur en mm de la plaque (ou du dessin sans plaque). */
  width: number;
  /** Coin haut-gauche du dessin sur le panneau, sans plaque (mm). */
  x: number;
  y: number;
  angle: number;
  maxPoints: number;
}

export interface TracePlan {
  zones: Zone[];
  panel: Panel | null;
}

/** Formes tracées de chaque zone (unités SVG), calculées une fois. */
export function traceShapes(g: CellGrid, zones: readonly TraceZone[]): Map<number, TracedShape[]> {
  return new Map(zones.map((z) => [z.id, traceRegion(g, new Set(z.cells))]));
}

/** Boîte de référence : la plaque si elle existe, sinon tout le dessin. */
export function traceRefBox(g: CellGrid, zones: readonly TraceZone[], shapes: Map<number, TracedShape[]>): BBox {
  const plate = zones.find((z) => z.role === 'plaque');
  const pts = plate ? (shapes.get(plate.id) ?? []).flatMap((s) => s.pts) : [];
  if (pts.length) return bbox(pts);
  const used = zones.flatMap((z) => (shapes.get(z.id) ?? []).flatMap((s) => s.pts));
  return used.length ? bbox(used) : g.box;
}

export function planTrace(g: CellGrid, zones: readonly TraceZone[], o: TracePlanOptions, startId: number, shapes = traceShapes(g, zones)): TracePlan {
  const plate = zones.find((z) => z.role === 'plaque');
  const ref = traceRefBox(g, zones, shapes);
  const k = o.width / Math.max(1e-9, ref[2] - ref[0]);
  const ox = plate ? 0 : o.x;
  const oy = plate ? 0 : o.y;
  const map = (q: Point[]) => q.map(([x, y]): Point => [ox + (x - ref[0]) * k, oy + (y - ref[1]) * k]);
  const out: Zone[] = [];
  // ordre de pose : paille dans l'ordre de création, trous ensuite
  for (const z of [...zones.filter((q) => q.role === 'motif'), ...zones.filter((q) => q.role === 'trou')]) {
    const parts = shapes.get(z.id) ?? [];
    parts.forEach((s, i) => {
      const pts = shapeOutline({ pts: map(s.pts), holes: s.holes.map(map) }, o.maxPoints);
      if (pts.length < 3) return;
      const hole = z.role === 'trou';
      const zone: Zone = {
        id: startId + out.length,
        ...polyZone(pts),
        name: (parts.length > 1 ? `${z.name} ${i + 1}` : z.name).slice(0, 40),
        color: z.color,
        angle: o.angle,
        hole,
      };
      if (hole) zone.edge = { type: 'droit', size: 2 };
      out.push(zone);
    });
  }
  let panel: TracePlan['panel'] = null;
  if (plate) {
    const ps = shapes.get(plate.id) ?? [];
    const w = Math.max(1, Math.round((ref[2] - ref[0]) * k));
    const h = Math.max(1, Math.round((ref[3] - ref[1]) * k));
    // plaque en plusieurs morceaux : on garde le plus grand
    const main = ps.reduce<TracedShape | null>((m, s) => (!m || Math.abs(signedArea(s.pts)) > Math.abs(signedArea(m.pts)) ? s : m), null);
    if (main) {
      panel = plateToPanel(map(main.pts), w, h);
      main.holes.forEach((hh, i) => {
        const pts = shapeOutline({ pts: map(hh), holes: [] }, o.maxPoints);
        if (pts.length < 3) return;
        out.push({ id: startId + out.length, ...polyZone(pts), name: `Creux de la plaque ${i + 1}`, color: 'naturel', angle: o.angle, hole: true, edge: { type: 'droit', size: 2 } });
      });
    } else panel = { w, h };
  }
  return { zones: out, panel };
}
