import { Prepared } from '../../core/geometry/geometry';
import { Project } from '../../core/model/project';
import { drawStrawPanel, StrawMode } from '../straw-2d.renderer';

export const MAX_MAP_SIZE = 2048;

export interface StrawMaps {
  albedo: HTMLCanvasElement;
  direction: HTMLCanvasElement;
  /** Pixels par mm. */
  scale: number;
}

/**
 * Albedo (rendu 2D sans reflet) et direction du fil (R, G = cos, sin remappés ; B = décalage par brin).
 * Les trous de `skipHoles` sont percés dans la géométrie, les autres sont découpés dans l'albedo.
 */
export function buildStrawMaps(
  p: Project,
  D: Prepared,
  fiber: HTMLCanvasElement,
  skipHoles: ReadonlySet<number>,
  reuse?: StrawMaps,
): StrawMaps {
  const { w, h } = p.panel;
  const scale = Math.min(MAX_MAP_SIZE / Math.max(w, h), 6);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const albedo = reuse?.albedo ?? document.createElement('canvas');
  const direction = reuse?.direction ?? document.createElement('canvas');
  const draw = (c: HTMLCanvasElement, mode: StrawMode) => {
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // une CanvasPattern est liée à son contexte : on la recrée ici
    const pattern = ctx.createPattern(fiber, 'repeat');
    drawStrawPanel(ctx, p, D, {
      view: { scale, ox: 0, oy: 0 },
      fiber: pattern,
      decorations: false,
      mode,
      skipHoles,
      outline: Math.max(1, scale * 0.5),
    });
  };
  draw(albedo, 'alb');
  draw(direction, 'dir');
  return { albedo, direction, scale };
}
