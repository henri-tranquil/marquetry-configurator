import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { prepare } from '../../core/geometry/geometry';
import { Project } from '../../core/model/project';
import { drawStrawPanel } from '../../render/straw-2d.renderer';

/** Petit rendu paille d'un projet (aperçus de motifs). */
@Component({
  selector: 'app-project-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c aria-hidden="true"></canvas>`,
  styles: `
    :host { display: block; }
    canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
  `,
})
export class ProjectThumbComponent {
  readonly project = input.required<Project>();
  /** Plus grande dimension en px CSS. */
  readonly size = input(96);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');

  constructor() {
    afterRenderEffect(() => {
      const p = this.project();
      const c = this.canvas().nativeElement;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = (this.size() * dpr) / Math.max(p.panel.w, p.panel.h);
      c.width = Math.max(1, Math.round(p.panel.w * k));
      c.height = Math.max(1, Math.round(p.panel.h * k));
      c.style.aspectRatio = `${p.panel.w} / ${p.panel.h}`;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      drawStrawPanel(ctx, p, prepare(p.zones), { view: { scale: k, ox: 0, oy: 0 }, fiber: null, decorations: false, mode: 'shaded' });
    });
  }
}
