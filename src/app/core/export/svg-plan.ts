import {
  edgeInfo,
  labelPoint,
  offsetPolygon,
  panelPolygon,
  prepare,
  profileBands,
} from '../geometry/geometry';
import { fillCenter, hasFillCenter, zoneFillPieces } from '../geometry/fill';
import { strawInfo, Point, Project } from '../model/project';

const f2 = (v: number) => v.toFixed(2);
const f1 = (v: number) => v.toFixed(1);
const pts = (p: readonly Point[]) => p.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');

/**
 * Plan de pose au format SVG, en millimètres : imprimé à 100 % il sert de gabarit.
 * Aucun texte utilisateur n'y est injecté (seuls les numéros de pose).
 */
export function svgPlan(p: Project): string {
  const { w, h } = p.panel;
  const sw = p.sw * 1.6;
  const D = prepare(p.zones);
  const fs = Math.max(4, Math.min(w, h) / 45);
  const outline = p.panel.outline
    ? `<path d="M${panelPolygon(p.panel).map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L')}Z"`
    : p.panel.round
    ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"`
    : `<rect width="${w}" height="${h}"`;
  let defs = `<clipPath id="pc">${outline}/></clipPath>`;
  let body = '';
  const pat = (id: string, a: number, c: string) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${sw}" height="${sw}" patternTransform="rotate(${a})">` +
    `<rect width="${sw}" height="${sw}" fill="#fff"/><rect width="${sw}" height="${f2(sw * 0.18)}" fill="${c}"/></pattern>`;

  if (p.bg.mode === 'paille') {
    defs += pat('bg', p.bg.angle, strawInfo(p.bg.color).hex);
    body += `<rect width="${w}" height="${h}" fill="url(#bg)"/>`;
  } else body += `<rect width="${w}" height="${h}" fill="#efe6d6"/>`;

  let marks = '';
  D.zones.forEach((o, i) => {
    const z = o.zone;
    const hex = strawInfo(z.color).hex;
    const pieces = zoneFillPieces(z, o.poly, p.panel, p.sw, 0);
    if (!z.fill || z.fill.type === 'parallele') {
      defs += pat(`p${i}`, z.angle, hex);
      body += `<polygon points="${pts(o.poly)}" fill="url(#p${i})" stroke="#1d1d1d" stroke-width="0.4"/>`;
      return;
    }
    defs += `<clipPath id="c${i}"><polygon points="${pts(o.poly)}"/></clipPath>`;
    let inner = '';
    const angles = new Map<number, string>();
    for (const pc of pieces) {
      if (pc.solid) {
        // une ligne médiane tous les 2 brins (écart ≈ celui des hachures parallèles)
        if (pc.lane % 2 === 0) inner += `<polyline points="${pts(pc.axis)}" fill="none" stroke="${hex}" stroke-width="${f2(p.sw * 0.29)}"/>`;
        continue;
      }
      let id = angles.get(pc.angle);
      if (!id) {
        id = `p${i}_${angles.size}`;
        angles.set(pc.angle, id);
        defs += pat(id, pc.angle, hex);
      }
      inner += `<polygon points="${pts(pc.poly)}" fill="url(#${id})"/>`;
    }
    body +=
      `<polygon points="${pts(o.poly)}" fill="#fff"/><g clip-path="url(#c${i})">${inner}</g>` +
      `<polygon points="${pts(o.poly)}" fill="none" stroke="#1d1d1d" stroke-width="0.4"/>`;
    if (hasFillCenter(z)) {
      const [cx, cy] = fillCenter(z);
      marks +=
        `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="2" fill="none" stroke="#1d1d1d" stroke-width="0.3"/>` +
        `<path d="M${f2(cx - 4)} ${f2(cy)}h8M${f2(cx)} ${f2(cy - 4)}v8" stroke="#1d1d1d" stroke-width="0.3"/>`;
    }
  });
  for (const o of D.holes)
    body += `<polygon points="${pts(o.poly)}" fill="#fff" stroke="#e2483d" stroke-width="0.5" stroke-dasharray="2 1.5"/>`;
  for (const b of profileBands(p, D))
    body += `<polygon points="${pts(offsetPolygon(b.poly, edgeInfo(b.poly, b.matIn), b.r))}" fill="none" stroke="#777" stroke-width="0.3" stroke-dasharray="1.5 1.5"/>`;

  body += marks;
  let labels = '';
  for (const o of D.zones) {
    const lp = labelPoint(D, o, p.panel);
    if (!lp) continue;
    const n = p.zones.indexOf(o.zone) + 1;
    labels +=
      `<circle cx="${f1(lp[0])}" cy="${f1(lp[1])}" r="${f1(fs * 0.8)}" fill="#fff" stroke="#1d1d1d" stroke-width="0.3"/>` +
      `<text x="${f1(lp[0])}" y="${f1(lp[1] + fs * 0.35)}" font-size="${f1(fs)}" text-anchor="middle" font-family="Arial,sans-serif">${n}</text>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
    `<defs>${defs}</defs><g clip-path="url(#pc)">${body}${labels}</g>` +
    `${outline} fill="none" stroke="#000" stroke-width="0.5"/></svg>`
  );
}
