/** Surimpressions de l'éditeur : cotes, sélection et poignées, soleil d'azimut. */
import { fillCenter, hasFillCenter } from '../core/geometry/fill';
import { RAD, zonePolygon } from '../core/geometry/geometry';
import { SnapGuides } from '../core/geometry/snap';
import { Point, Project, Zone } from '../core/model/project';
import { Ctx2D, toScreen, tracePath, ViewTransform } from './straw-2d.renderer';

export interface Handles {
  /** Poignée de taille (coin bas droit) : proportions gardées. */
  size: Point;
  /** Milieu du côté droit : largeur seule (absente si la forme est trop petite à l'écran). */
  sideW: Point | null;
  /** Milieu du côté bas : hauteur seule. */
  sideH: Point | null;
  /** Poignée de rotation, au-dessus du bord haut. */
  rot: Point;
  top: Point;
  /** Point d'origine de l'éventail. */
  center: Point | null;
}

export function zoneHandles(z: Zone, v: ViewTransform): Handles {
  const r = z.rot * RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const L = (a: number, b: number) => toScreen(v, [z.x + a * z.w * c - b * z.h * s, z.y + a * z.w * s + b * z.h * c]);
  const top = L(0, -0.5);
  // sous ~56 px, les poignées de côté se marcheraient dessus avec celle du coin
  const roomy = Math.min(z.w, z.h) * v.scale >= 56;
  return {
    size: L(0.5, 0.5),
    sideW: roomy ? L(0.5, 0) : null,
    sideH: roomy ? L(0, 0.5) : null,
    rot: [top[0] + s * 26, top[1] - c * 26],
    top,
    center: hasFillCenter(z) ? toScreen(v, fillCenter(z)) : null,
  };
}

/** Position du soleil sur le bord du tapis, selon l'azimut. */
export function sunPosition(light: number, width: number, height: number): Point {
  const a = light * RAD;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const t = Math.min((width / 2 - 16) / Math.max(Math.abs(dx), 1e-6), (height / 2 - 16) / Math.max(Math.abs(dy), 1e-6));
  return [width / 2 + dx * t, height / 2 + dy * t];
}

/** Azimut (0–359) donné par un point du tapis. */
export function azimuthAt(x: number, y: number, width: number, height: number): number {
  return Math.round(((Math.atan2(y - height / 2, x - width / 2) / RAD) + 360) % 360);
}

export interface OverlayOptions {
  view: ViewTransform;
  width: number;
  height: number;
  selected: Zone | null;
  /** Repères d'aimantation actifs. */
  guides?: SnapGuides;
  font: string;
  format: (v: number) => string;
}

export function drawOverlay(ctx: Ctx2D, p: Project, o: OverlayOptions): void {
  const v = o.view;
  const pw = p.panel.w * v.scale;
  const ph = p.panel.h * v.scale;
  ctx.font = o.font;
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${o.format(p.panel.w)} mm`, v.ox + pw / 2, v.oy - 8);
  ctx.save();
  ctx.translate(v.ox - 8, v.oy + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${o.format(p.panel.h)} mm`, 0, 0);
  ctx.restore();

  const z = o.selected;
  if (z) {
    const pp = zonePolygon(z).map((q) => toScreen(v, q));
    const hd = zoneHandles(z, v);
    ctx.save();
    ctx.setLineDash([6, 4]);
    tracePath(ctx, pp);
    ctx.strokeStyle = '#ff5b4c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(...hd.top);
    ctx.lineTo(...hd.rot);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(hd.size[0] - 6, hd.size[1] - 6, 12, 12);
    for (const sd of [hd.sideW, hd.sideH]) if (sd) ctx.rect(sd[0] - 4.5, sd[1] - 4.5, 9, 9);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#e2483d';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hd.rot[0], hd.rot[1], 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (hd.center) {
      // origine de l'éventail : cible déplaçable
      const [x, y] = hd.center;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 13, y);
      ctx.lineTo(x + 13, y);
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  const g = o.guides;
  if (g && (g.x !== undefined || g.y !== undefined || g.point)) {
    ctx.save();
    ctx.strokeStyle = '#ff5b4c';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (g.x !== undefined) {
      const x = v.ox + g.x * v.scale;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, o.height);
    }
    if (g.y !== undefined) {
      const y = v.oy + g.y * v.scale;
      ctx.moveTo(0, y);
      ctx.lineTo(o.width, y);
    }
    ctx.stroke();
    if (g.point) {
      const [x, y] = toScreen(v, g.point);
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  const [sx, sy] = sunPosition(p.light, o.width, o.height);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.strokeStyle = '#ffe7a3';
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffe7a3';
  ctx.fill();
  ctx.restore();
}

/** Ajuste le panneau au canvas, et donne le pas de grille mm du tapis. */
export function fitView(p: Project, width: number, height: number): { view: ViewTransform; grid: number } {
  const m = width < 520 ? 30 : 46;
  const scale = Math.max(0.01, Math.min((width - 2 * m) / p.panel.w, (height - 2 * m) / p.panel.h));
  const view = { scale, ox: (width - p.panel.w * scale) / 2, oy: (height - p.panel.h * scale) / 2 };
  const grid = [5, 10, 50, 100, 500].find((g) => g * scale >= 10) ?? 1000;
  return { view, grid };
}
