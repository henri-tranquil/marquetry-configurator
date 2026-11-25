/**
 * Plan de pose découpé en pages A4 imprimables à 100 % : chaque page porte son repère (A1, B1…),
 * une bande de recouvrement avec des croix d'alignement, et une règle de contrôle de 50 mm.
 */
import { Project } from '../model/project';
import { svgPlan } from './svg-plan';

export interface Paper {
  w: number;
  h: number;
}

export const A4: Paper = { w: 210, h: 297 };
/** Marge non imprimable prudente (mm). */
export const PRINT_MARGIN = 10;
/** Hauteur réservée à l'en-tête de page (mm). */
const HEADER = 9;

export interface Tile {
  col: number;
  row: number;
  /** Repère lisible : lettre de colonne + numéro de rangée. */
  label: string;
  /** Fenêtre du panneau couverte par la page (mm). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TileLayout {
  landscape: boolean;
  cols: number;
  rows: number;
  /** Zone utile d'une page (mm). */
  cellW: number;
  cellH: number;
  overlap: number;
  tiles: Tile[];
}

const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26));

function layout(panel: Project['panel'], paper: Paper, overlap: number, landscape: boolean): TileLayout {
  const pw = landscape ? paper.h : paper.w;
  const ph = landscape ? paper.w : paper.h;
  const cellW = pw - 2 * PRINT_MARGIN;
  const cellH = ph - 2 * PRINT_MARGIN - HEADER;
  // pas entre deux pages : la zone utile moins le recouvrement
  const stepW = cellW - overlap;
  const stepH = cellH - overlap;
  const cols = Math.max(1, Math.ceil((panel.w - overlap) / stepW));
  const rows = Math.max(1, Math.ceil((panel.h - overlap) / stepH));
  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      tiles.push({ col: c, row: r, label: `${colName(c)}${r + 1}`, x: c * stepW, y: r * stepH, w: cellW, h: cellH });
  return { landscape, cols, rows, cellW, cellH, overlap, tiles };
}

/** Découpage en pages : l'orientation qui demande le moins de feuilles (portrait à égalité). */
export function tileLayout(panel: Project['panel'], paper: Paper = A4, overlap = 10): TileLayout {
  const a = layout(panel, paper, overlap, false);
  const b = layout(panel, paper, overlap, true);
  return b.tiles.length < a.tiles.length ? b : a;
}

const f = (v: number) => +v.toFixed(2);

/** Croix d'alignement (mm, repère de la page). */
function cross(x: number, y: number): string {
  return `<g stroke="#000" stroke-width="0.25"><line x1="${f(x - 4)}" y1="${f(y)}" x2="${f(x + 4)}" y2="${f(y)}"/><line x1="${f(x)}" y1="${f(y - 4)}" x2="${f(x)}" y2="${f(y + 4)}"/><circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="none"/></g>`;
}

/** Document HTML autonome, une page par feuille. Aucun texte utilisateur n'y est injecté. */
export function tiledPlanHtml(p: Project, paper: Paper = A4, overlap = 10): string {
  const L = tileLayout(p.panel, paper, overlap);
  const pw = L.landscape ? paper.h : paper.w;
  const ph = L.landscape ? paper.w : paper.h;
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgPlan(p));
  const n = L.tiles.length;
  const pages = L.tiles
    .map((t, i) => {
      const ov = overlap;
      // croix dans les bandes de recouvrement (communes aux deux pages voisines)
      let marks = '';
      const xs = [ov / 2, t.w - ov / 2];
      const ys = [ov / 2, t.h - ov / 2];
      for (const x of xs) for (const y of ys) {
        const ax = t.x + x;
        const ay = t.y + y;
        if (ax > 0 && ax < p.panel.w && ay > 0 && ay < p.panel.h) marks += cross(x, y);
      }
      let lines = '';
      if (t.col > 0) lines += `<line x1="${f(ov)}" y1="0" x2="${f(ov)}" y2="${f(t.h)}"/>`;
      if (t.col < L.cols - 1) lines += `<line x1="${f(t.w - ov)}" y1="0" x2="${f(t.w - ov)}" y2="${f(t.h)}"/>`;
      if (t.row > 0) lines += `<line x1="0" y1="${f(ov)}" x2="${f(t.w)}" y2="${f(ov)}"/>`;
      if (t.row < L.rows - 1) lines += `<line x1="0" y1="${f(t.h - ov)}" x2="${f(t.w)}" y2="${f(t.h - ov)}"/>`;
      const near = [
        t.col > 0 ? `← ${colName(t.col - 1)}${t.row + 1}` : '',
        t.col < L.cols - 1 ? `${colName(t.col + 1)}${t.row + 1} →` : '',
        t.row > 0 ? `↑ ${colName(t.col)}${t.row}` : '',
        t.row < L.rows - 1 ? `↓ ${colName(t.col)}${t.row + 2}` : '',
      ].filter(Boolean).join(' · ');
      return `<section class="page">
<header><b>${t.label}</b> · page ${i + 1}/${n} · panneau ${f(p.panel.w)} × ${f(p.panel.h)} mm · x ${f(t.x)}–${f(Math.min(p.panel.w, t.x + t.w))}, y ${f(t.y)}–${f(Math.min(p.panel.h, t.y + t.h))} mm<span>${near}</span></header>
<div class="cell"><img src="${src}" alt="" style="left:${f(-t.x)}mm;top:${f(-t.y)}mm"/>
<svg class="over" viewBox="0 0 ${f(t.w)} ${f(t.h)}"><g stroke="#e2483d" stroke-width="0.3" stroke-dasharray="2 1.5">${lines}</g>${marks}
<g transform="translate(${f(t.w - 58)} ${f(t.h - 6)})"><rect x="-1" y="-4.5" width="54" height="7" fill="#fff" opacity=".85"/><line x1="0" y1="0" x2="50" y2="0" stroke="#000" stroke-width="0.4"/><line x1="0" y1="-1.5" x2="0" y2="1.5" stroke="#000" stroke-width="0.4"/><line x1="50" y1="-1.5" x2="50" y2="1.5" stroke="#000" stroke-width="0.4"/><text x="25" y="-1.2" font-size="2.6" text-anchor="middle" font-family="sans-serif">50 mm : vérifie l'échelle</text></g></svg>
</div></section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Plan de pose ${f(p.panel.w)} × ${f(p.panel.h)} mm · ${n} page${n > 1 ? 's' : ''}</title>
<style>
@page { size: ${pw}mm ${ph}mm; margin: ${PRINT_MARGIN}mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 12px system-ui, sans-serif; color: #111; background: #ddd; }
.notice { max-width: 720px; margin: 16px auto; padding: 12px 16px; background: #fff; border-radius: 8px; line-height: 1.5; }
.page { width: ${pw - 2 * PRINT_MARGIN}mm; height: ${ph - 2 * PRINT_MARGIN}mm; margin: 12px auto; background: #fff; break-after: page; overflow: hidden; }
.page:last-child { break-after: auto; }
header { height: ${HEADER}mm; display: flex; justify-content: space-between; align-items: center; font-size: 10px; border-bottom: 0.3mm solid #000; }
header span { color: #555; }
.cell { position: relative; width: ${f(L.cellW)}mm; height: ${f(L.cellH)}mm; overflow: hidden; }
.cell img { position: absolute; width: ${f(p.panel.w)}mm; height: ${f(p.panel.h)}mm; }
.over { position: absolute; inset: 0; width: 100%; height: 100%; }
@media print { body { background: #fff; } .notice { display: none; } .page { margin: 0; } }
</style></head><body>
<div class="notice"><b>${n} page${n > 1 ? 's' : ''} ${L.landscape ? 'paysage' : 'portrait'}, ${L.cols} × ${L.rows}.</b> Imprime avec Ctrl+P à l'échelle <b>100 %</b> (pas « ajuster à la page »), puis mesure la règle de 50 mm en bas de chaque feuille. Les pages se recouvrent de ${overlap} mm : superpose les pointillés rouges et les croix, puis scotche.</div>
${pages}
</body></html>`;
}
