/**
 * Rendu paille sur canvas 2D. Aucune dépendance Angular : tout arrive en paramètres.
 * Physique : la paille brille quand la lumière arrive EN TRAVERS des brins.
 */
import {
  bbox,
  BBox,
  edgeInfo,
  offsetPolygon,
  panelPolygon,
  Prepared,
  profileBands,
  RAD,
  rng,
} from '../core/geometry/geometry';
import { PALETTE, Point, Project, STRAW_SEGMENT, WOOD_HEX } from '../core/model/project';

/** Passage mm → pixels CSS du canvas. */
export interface ViewTransform {
  scale: number;
  ox: number;
  oy: number;
}

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 'alb' : albedo sans reflet ; 'dir' : direction du fil encodée en RVB (textures 3D). */
export type StrawMode = 'shaded' | 'alb' | 'dir';

export const toScreen = (v: ViewTransform, [x, y]: Point): Point => [v.ox + x * v.scale, v.oy + y * v.scale];
export const toMM = (v: ViewTransform, [x, y]: Point): Point => [(x - v.ox) / v.scale, (y - v.oy) / v.scale];

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Facteur de luminosité 2D : 1 − c·0,42 + c·0,72·sin²(fil − lumière). */
export function sheen(angle: number, light: number, contrast: number): number {
  const d = (angle - light) * RAD;
  return 1 - contrast * 0.42 + contrast * 0.72 * Math.sin(d) ** 2;
}

/** Texture de fibres (à multiplier sur les bandes). Une CanvasPattern par contexte. */
export function createFiberTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const t = c.getContext('2d');
  if (!t) return c;
  const r = rng(7);
  t.fillStyle = '#fff';
  t.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1100; i++) {
    const y = r() * 256;
    const x = r() * 256;
    const l = 20 + r() * 150;
    const hh = r() < 0.5 ? 1 : 0.6;
    t.fillStyle = `rgba(95,62,22,${0.04 + r() * 0.12})`;
    t.fillRect(x, y, l, hh);
    t.fillRect(x - 256, y, l, hh);
  }
  return c;
}

export function tracePath(ctx: Ctx2D, pp: readonly Point[]): void {
  ctx.beginPath();
  pp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Zone de dessin = bbox(polygone) ∩ panneau, en pixels : [cx, cy, diagonale]. */
function region(pp: readonly Point[], panelPx: BBox): [number, number, number] | null {
  const b = bbox(pp);
  const x0 = Math.max(b[0], panelPx[0]);
  const y0 = Math.max(b[1], panelPx[1]);
  const x1 = Math.min(b[2], panelPx[2]);
  const y1 = Math.min(b[3], panelPx[3]);
  return x1 > x0 && y1 > y0 ? [(x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) + 4] : null;
}

export interface StrawParams {
  /** Largeur d'un brin en px. */
  swPx: number;
  /** Longueur utile d'un brin en px. */
  segPx: number;
  irr: number;
  light: number;
  contrast: number;
  /** Panneau en px, pour borner les boucles. */
  panelPx: BBox;
  fiber: CanvasPattern | null;
  mode: StrawMode;
}

/** Remplit un polygone (en px) de bandes de paille dans le sens `angle`. */
export function drawStraw(
  ctx: Ctx2D,
  pp: readonly Point[],
  angle: number,
  hex: string,
  seed: number,
  sp: StrawParams,
): void {
  const g = region(pp, sp.panelPx);
  if (!g) return;
  const [cx, cy, d] = g;
  const mode = sp.mode;
  const w = Math.max(1.2, sp.swPx);
  const f = mode === 'shaded' ? sheen(angle, sp.light, sp.contrast) : 1;
  const base = hexToRgb(hex);
  const r = rng(seed);
  const h = d / 2;
  const seg = sp.segPx;
  // détails coupés quand une bande fait moins de 2 px à l'écran
  const detailed = w >= 2;
  const cuts = detailed && seg > 28;
  const hi = mode === 'shaded' && w > 2.5 ? Math.max(0, 0.16 * (f - 0.62)) : 0;
  const dc = Math.cos(angle * RAD) * 127.5 + 127.5;
  const ds = Math.sin(angle * RAD) * 127.5 + 127.5;

  ctx.save();
  tracePath(ctx, pp);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(angle * RAD);
  const n = Math.ceil(d / w) + 1;
  for (let i = 0; i < n; i++) {
    const y = -h + i * w;
    const jt = r();
    if (mode === 'dir') {
      // R, G = cos, sin du fil ; B = décalage propre au brin
      ctx.fillStyle = `rgb(${clamp255(dc)},${clamp255(ds)},${clamp255(r() * 255)})`;
      ctx.fillRect(-h, y, d, w + 0.6);
      continue;
    }
    const k = f * (1 + (jt - 0.5) * sp.irr * 0.34);
    ctx.fillStyle = `rgb(${clamp255(base[0] * k)},${clamp255(base[1] * k)},${clamp255(base[2] * k)})`;
    ctx.fillRect(-h, y, d, w + 0.6);
    if (hi) {
      ctx.fillStyle = `rgba(255,248,228,${hi})`;
      ctx.fillRect(-h, y + w * 0.22, d, w * 0.22);
    }
    if (detailed) {
      ctx.fillStyle = 'rgba(42,26,10,.34)';
      ctx.fillRect(-h, y, d, Math.max(0.5, w * 0.07));
    }
    if (cuts) {
      let x = -h - r() * seg;
      while (x < h) {
        x += seg * (0.6 + r() * 0.8);
        ctx.fillRect(x, y, Math.max(0.6, w * 0.09), w);
      }
    }
  }
  if (mode !== 'dir' && sp.fiber) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = sp.fiber;
    ctx.fillRect(-h, -h, d, d);
  }
  ctx.restore();
}

/** Médium nu : couleur bois + fibres légères. */
export function drawWood(ctx: Ctx2D, x: number, y: number, w: number, h: number, fiber: CanvasPattern | null): void {
  ctx.fillStyle = WOOD_HEX;
  ctx.fillRect(x, y, w, h);
  if (!fiber) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = fiber;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Graine stable d'une zone (même formule que le prototype). */
export const zoneSeed = (id: number) => id * 131 + 7;

export interface StrawSceneOptions {
  view: ViewTransform;
  fiber: CanvasPattern | null;
  /** Effets d'écran : ombre portée, ombre intérieure des trous, bandes de profil. */
  decorations: boolean;
  mode: StrawMode;
  /** Trous à ne pas découper (pour la 3D, ceux qui sont percés dans la géométrie). */
  skipHoles?: ReadonlySet<number>;
  /** Épaisseur des contours de zone en px. */
  outline?: number;
}

/** Fond + zones dans l'ordre de pose + trous. Ne dessine pas les poignées. */
export function drawStrawPanel(ctx: Ctx2D, p: Project, D: Prepared, o: StrawSceneOptions): void {
  const v = o.view;
  const pw = p.panel.w * v.scale;
  const ph = p.panel.h * v.scale;
  const PP = panelPolygon(p.panel).map((q) => toScreen(v, q));
  const panelPx: BBox = [v.ox, v.oy, v.ox + pw, v.oy + ph];
  const sp: StrawParams = {
    swPx: p.sw * v.scale,
    segPx: STRAW_SEGMENT * v.scale,
    irr: p.irr,
    light: p.light,
    contrast: p.contrast,
    panelPx,
    fiber: o.fiber,
    mode: o.mode,
  };

  if (o.decorations) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = WOOD_HEX;
    ctx.fillRect(v.ox, v.oy, pw, ph);
    ctx.restore();
  }

  ctx.save();
  tracePath(ctx, PP);
  ctx.clip();
  if (p.bg.mode === 'paille') drawStraw(ctx, PP, p.bg.angle, PALETTE[p.bg.color].hex, 1, sp);
  else if (o.mode === 'dir') {
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(v.ox, v.oy, pw, ph);
  } else drawWood(ctx, v.ox, v.oy, pw, ph, o.fiber);

  for (const z of D.zones) {
    const pp = z.poly.map((q) => toScreen(v, q));
    drawStraw(ctx, pp, z.zone.angle, PALETTE[z.zone.color].hex, zoneSeed(z.zone.id), sp);
    if (o.mode !== 'dir') {
      tracePath(ctx, pp);
      ctx.strokeStyle = 'rgba(30,18,8,.5)';
      ctx.lineWidth = o.outline ?? 0.9;
      ctx.stroke();
    }
  }
  ctx.restore();

  // trous : toujours après toutes les zones
  if (o.mode !== 'dir')
    for (const hz of D.holes) {
      if (o.skipHoles?.has(hz.zone.id)) continue;
      const pp = hz.poly.map((q) => toScreen(v, q));
      ctx.save();
      tracePath(ctx, PP);
      ctx.clip();
      ctx.globalCompositeOperation = 'destination-out';
      tracePath(ctx, pp);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (o.decorations) {
        // ombre intérieure
        tracePath(ctx, pp);
        ctx.clip();
        tracePath(ctx, pp);
        ctx.strokeStyle = 'rgba(0,0,0,.42)';
        ctx.lineWidth = Math.max(3, 8 * Math.min(1, v.scale));
        ctx.stroke();
      }
      ctx.restore();
    }

  if (o.decorations) {
    ctx.save();
    tracePath(ctx, PP);
    ctx.clip();
    for (const b of profileBands(p, D)) {
      const pp = b.poly.map((q) => toScreen(v, q));
      const ip = offsetPolygon(b.poly, edgeInfo(b.poly, b.matIn), b.r).map((q) => toScreen(v, q));
      ctx.beginPath();
      for (const q of [pp, ip]) {
        q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(20,10,0,.16)';
      ctx.fill('evenodd');
      tracePath(ctx, ip);
      ctx.strokeStyle = 'rgba(255,246,222,.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(v.ox + 0.5, v.oy + 0.5, pw - 1, ph - 1);
  }
}
