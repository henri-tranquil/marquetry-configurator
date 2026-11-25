import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { prepare } from '../../core/geometry/geometry';
import { Point, Project } from '../../core/model/project';
import { drawStrawPanel } from '../../render/straw-2d.renderer';

/** Petit rendu paille d'un projet (aperçus de motifs, de suggestions, d'import). */
@Component({
  selector: 'app-project-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c aria-hidden="true" (click)="click($event)"></canvas>`,
  styles: `
    :host { display: block; }
    canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
  `,
})
export class ProjectThumbComponent {
  readonly project = input.required<Project>();
  /** Plus grande dimension en px CSS. */
  readonly size = input(96);
  /** Contour à mettre en évidence (mm). */
  readonly highlight = input<readonly Point[] | null>(null);
  /** Clic sur l'aperçu, en mm du panneau. */
  readonly pickedAt = output<Point>();
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
      const hl = this.highlight();
      if (hl && hl.length > 2) {
        ctx.save();
        ctx.beginPath();
        hl.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
        ctx.closePath();
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeStyle = '#e2483d';
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  protected click(e: MouseEvent): void {
    const p = this.project();
    const r = this.canvas().nativeElement.getBoundingClientRect();
    // image en « contain » : on retrouve sa place dans la boîte du canvas
    const ratio = p.panel.w / p.panel.h;
    const w = Math.min(r.width, r.height * ratio);
    const h = w / ratio;
    const x = e.clientX - r.left - (r.width - w) / 2;
    const y = e.clientY - r.top - (r.height - h) / 2;
    const s = w / p.panel.w;
    this.pickedAt.emit([x / s, y / s]);
  }
}
