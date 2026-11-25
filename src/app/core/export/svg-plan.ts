import {
  edgeInfo,
  labelPoint,
  offsetPolygon,
  prepare,
  profileBands,
} from '../geometry/geometry';
import { PALETTE, Point, Project } from '../model/project';

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
  let defs = `<clipPath id="pc"><rect width="${w}" height="${h}"/></clipPath>`;
  let body = '';
  const pat = (id: string, a: number, c: string) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${sw}" height="${sw}" patternTransform="rotate(${a})">` +
    `<rect width="${sw}" height="${sw}" fill="#fff"/><rect width="${sw}" height="${f2(sw * 0.18)}" fill="${c}"/></pattern>`;

  if (p.bg.mode === 'paille') {
    defs += pat('bg', p.bg.angle, PALETTE[p.bg.color].hex);
    body += `<rect width="${w}" height="${h}" fill="url(#bg)"/>`;
  } else body += `<rect width="${w}" height="${h}" fill="#efe6d6"/>`;

  D.zones.forEach((o, i) => {
    defs += pat(`p${i}`, o.zone.angle, PALETTE[o.zone.color].hex);
    body += `<polygon points="${pts(o.poly)}" fill="url(#p${i})" stroke="#1d1d1d" stroke-width="0.4"/>`;
  });
  for (const o of D.holes)
    body += `<polygon points="${pts(o.poly)}" fill="#fff" stroke="#e2483d" stroke-width="0.5" stroke-dasharray="2 1.5"/>`;
  for (const b of profileBands(p, D))
    body += `<polygon points="${pts(offsetPolygon(b.poly, edgeInfo(b.poly, b.matIn), b.r))}" fill="none" stroke="#777" stroke-width="0.3" stroke-dasharray="1.5 1.5"/>`;

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
    `<rect width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="0.5"/></svg>`
  );
}
