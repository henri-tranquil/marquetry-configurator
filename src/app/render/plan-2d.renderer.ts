/** Plan de pose : hachures dans le sens du fil, contours, numéros, trous et profils en pointillés. */
import {
  edgeInfo,
  labelPoint,
  offsetPolygon,
  panelPolygon,
  Prepared,
  profileBands,
  RAD,
} from '../core/geometry/geometry';
import { fillCenter, hasFillCenter, zoneFillPieces } from '../core/geometry/fill';
import { PALETTE, Point, Project, Zone } from '../core/model/project';
import { Ctx2D, toScreen, tracePath, ViewTransform } from './straw-2d.renderer';

function hatch(ctx: Ctx2D, pp: readonly Point[], angle: number, hex: string, stepPx: number, panelPx: [number, number, number, number]): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pp) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  x0 = Math.max(x0, panelPx[0]);
  y0 = Math.max(y0, panelPx[1]);
  x1 = Math.min(x1, panelPx[2]);
  y1 = Math.min(y1, panelPx[3]);
  if (x1 <= x0 || y1 <= y0) return;
  const d = Math.hypot(x1 - x0, y1 - y0) + 4;
  const h = d / 2;
  ctx.save();
  tracePath(ctx, pp);
  ctx.clip();
  ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
  ctx.rotate(angle * RAD);
  ctx.fillStyle = hex;
  for (let y = -h; y < h; y += stepPx) ctx.fillRect(-h, y, d, 1.3);
  ctx.restore();
}

/** Hachures dans le sens du fil, quelle que soit la disposition. */
function hatchZone(
  ctx: Ctx2D,
  z: Zone,
  poly: Point[],
  p: Project,
  v: ViewTransform,
  stepPx: number,
  panelPx: [number, number, number, number],
): void {
  const hex = PALETTE[z.color].hex;
  const pieces = zoneFillPieces(z, poly, p.panel, p.sw, 0);
  ctx.save();
  tracePath(ctx, poly.map((q) => toScreen(v, q)));
  ctx.clip();
  // brins pleins : une ligne médiane tous les `every` brins pour garder l'écart des hachures
  const every = Math.max(1, Math.round(stepPx / Math.max(0.1, p.sw * v.scale)));
  ctx.beginPath();
  for (const pc of pieces) {
    if (!pc.solid) {
      hatch(ctx, pc.poly.map((q) => toScreen(v, q)), pc.angle, hex, stepPx, panelPx);
      continue;
    }
    if (((pc.lane % every) + every) % every !== 0) continue;
    pc.axis.forEach((q, i) => (i ? ctx.lineTo(...toScreen(v, q)) : ctx.moveTo(...toScreen(v, q))));
  }
  ctx.strokeStyle = hex;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}

/** Croix sur le point d'origine d'un éventail : repère de pose. */
function drawCenterMark(ctx: Ctx2D, z: Zone, v: ViewTransform): void {
  const [x, y] = toScreen(v, fillCenter(z));
  ctx.save();
  ctx.strokeStyle = '#1d1d1d';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x + 9, y);
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x, y + 9);
  ctx.stroke();
  ctx.restore();
}

export interface PlanOptions {
  view: ViewTransform;
  font: string;
}

export function drawPlanPanel(ctx: Ctx2D, p: Project, D: Prepared, o: PlanOptions): void {
  const v = o.view;
  const pw = p.panel.w * v.scale;
  const ph = p.panel.h * v.scale;
  const PP = panelPolygon(p.panel).map((q) => toScreen(v, q));
  const panelPx: [number, number, number, number] = [v.ox, v.oy, v.ox + pw, v.oy + ph];
  const step = Math.max(4, p.sw * v.scale * 1.6);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = '#fff';
  ctx.fillRect(v.ox, v.oy, pw, ph);
  ctx.restore();

  ctx.save();
  tracePath(ctx, PP);
  ctx.clip();
  if (p.bg.mode === 'paille') hatch(ctx, PP, p.bg.angle, PALETTE[p.bg.color].hex, step, panelPx);
  else {
    ctx.fillStyle = '#efe6d6';
    ctx.fillRect(v.ox, v.oy, pw, ph);
  }
  for (const z of D.zones) {
    const pp = z.poly.map((q) => toScreen(v, q));
    tracePath(ctx, pp);
    ctx.fillStyle = '#fff';
    ctx.fill();
    hatchZone(ctx, z.zone, z.poly, p, v, step, panelPx);
    tracePath(ctx, pp);
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  for (const hz of D.holes) {
    const pp = hz.poly.map((q) => toScreen(v, q));
    ctx.save();
    tracePath(ctx, PP);
    ctx.clip();
    ctx.globalCompositeOperation = 'destination-out';
    tracePath(ctx, pp);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([5, 4]);
    tracePath(ctx, pp);
    ctx.strokeStyle = '#e2483d';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  tracePath(ctx, PP);
  ctx.clip();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 1;
  for (const b of profileBands(p, D)) {
    tracePath(ctx, offsetPolygon(b.poly, edgeInfo(b.poly, b.matIn), b.r).map((q) => toScreen(v, q)));
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(v.ox + 0.5, v.oy + 0.5, pw - 1, ph - 1);

  for (const z of D.zones) if (hasFillCenter(z.zone)) drawCenterMark(ctx, z.zone, v);

  // numéros de pose = index + 1, posés sur un point réellement visible
  ctx.font = o.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const z of D.zones) {
    const lp = labelPoint(D, z, p.panel);
    if (!lp) continue;
    const [x, y] = toScreen(v, lp);
    const n = String(p.zones.indexOf(z.zone) + 1);
    const rr = Math.max(9, ctx.measureText(n).width / 2 + 5);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#1d1d1d';
    ctx.fillText(n, x, y + 0.5);
  }
}
