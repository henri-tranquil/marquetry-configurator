import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { pickAt, RAD, round05 } from '../../core/geometry/geometry';
import { Point, Zone } from '../../core/model/project';
import { drawPlanPanel } from '../../render/plan-2d.renderer';
import { azimuthAt, drawOverlay, fitView, sunPosition, zoneHandles } from '../../render/overlay-2d.renderer';
import { createFiberTexture, drawStrawPanel, toMM, ViewTransform } from '../../render/straw-2d.renderer';
import { fmt } from '../../shared/format';
import { ProjectStore } from '../../state/project.store';

type Drag =
  | { k: 'light' }
  | { k: 'move'; id: number; dx: number; dy: number }
  | { k: 'size'; id: number }
  | { k: 'rot'; id: number };

const HANDLE_HIT = 22; // rayon de capture des poignées : cible ≥ 44 px
const SUN_HIT = 22;

/** Canvas 2D de l'éditeur : rendu paille ou plan de pose, sélection et poignées. */
@Component({
  selector: 'app-stage-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #cv
      [style.cursor]="cursor()"
      [attr.aria-label]="store.project().view === 'plan' ? 'Plan de pose du panneau' : 'Aperçu du panneau en marqueterie de paille'"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up()"
      (pointercancel)="up()"
    ></canvas>
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  `,
})
export class StageCanvasComponent {
  protected readonly store = inject(ProjectStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  protected readonly cursor = signal('default');

  private ctx: CanvasRenderingContext2D | null = null;
  private fiber: CanvasPattern | null = null;
  private view: ViewTransform = { scale: 1, ox: 0, oy: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private drag: Drag | null = null;

  constructor() {
    effect(() => {
      // dépendances : tout ce qui change l'image
      this.store.project();
      this.store.selected();
      this.store.prepared();
      this.schedule();
    });
    afterNextRender(() => {
      const c = this.canvas().nativeElement;
      this.ctx = c.getContext('2d');
      this.fiber = this.ctx?.createPattern(createFiberTexture(), 'repeat') ?? null;
      const ro = new ResizeObserver(() => {
        this.layout();
        this.render();
      });
      ro.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
      document.fonts?.ready.then(() => this.schedule());
    });
    this.destroyRef.onDestroy(() => cancelAnimationFrame(this.raf));
  }

  private layout(): void {
    const fig = this.host.nativeElement.parentElement;
    const r = this.host.nativeElement.getBoundingClientRect();
    const c = this.canvas().nativeElement;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = r.width;
    this.height = r.height;
    c.width = Math.max(1, Math.round(this.width * this.dpr));
    c.height = Math.max(1, Math.round(this.height * this.dpr));
    const { view, grid } = fitView(this.store.project(), this.width, this.height);
    this.view = view;
    // grille mm adaptative du tapis
    const gp = grid * view.scale;
    fig?.style.setProperty('--g', `${gp}px`);
    fig?.style.setProperty('--gx', `${view.ox % gp}px`);
    fig?.style.setProperty('--gy', `${view.oy % gp}px`);
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.render());
  }

  private render(): void {
    this.raf = 0;
    const ctx = this.ctx;
    if (!ctx || !this.width) return;
    const p = this.store.project();
    // la taille du panneau a pu changer
    const fitted = fitView(p, this.width, this.height).view;
    if (fitted.scale !== this.view.scale || fitted.ox !== this.view.ox || fitted.oy !== this.view.oy) this.layout();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const D = this.store.prepared();
    if (p.view === 'plan') drawPlanPanel(ctx, p, D, { view: this.view, font: '600 12px Archivo, system-ui, sans-serif' });
    else drawStrawPanel(ctx, p, D, { view: this.view, fiber: this.fiber, decorations: true, mode: 'shaded' });
    drawOverlay(ctx, p, {
      view: this.view,
      width: this.width,
      height: this.height,
      selected: this.store.selected(),
      font: '500 13px Archivo, system-ui, sans-serif',
      format: (v) => fmt(v),
    });
  }

  /* ---------- pointeur ---------- */

  private pos(e: PointerEvent): Point {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private near(a: Point, b: Point, r: number): boolean {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < r;
  }

  private hitZone(pt: Point): Zone | null {
    const [x, y] = toMM(this.view, pt);
    return pickAt(this.store.prepared(), this.store.project().panel, x, y);
  }

  protected down(e: PointerEvent): void {
    const pt = this.pos(e);
    const z = this.store.selected();
    this.drag = null;
    if (this.near(pt, sunPosition(this.store.project().light, this.width, this.height), SUN_HIT)) this.drag = { k: 'light' };
    else if (z) {
      const hd = zoneHandles(z, this.view);
      if (this.near(pt, hd.size, HANDLE_HIT)) this.drag = { k: 'size', id: z.id };
      else if (this.near(pt, hd.rot, HANDLE_HIT)) this.drag = { k: 'rot', id: z.id };
    }
    if (!this.drag) {
      const t = this.hitZone(pt);
      this.store.select(t?.id ?? null);
      if (t) {
        const [mx, my] = toMM(this.view, pt);
        this.drag = { k: 'move', id: t.id, dx: mx - t.x, dy: my - t.y };
      }
    }
    if (this.drag) {
      this.canvas().nativeElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  protected move(e: PointerEvent): void {
    const pt = this.pos(e);
    const d = this.drag;
    if (!d) {
      this.updateCursor(pt);
      return;
    }
    const [mx, my] = toMM(this.view, pt);
    if (d.k === 'light') {
      this.store.patch({ light: azimuthAt(pt[0], pt[1], this.width, this.height) });
      return;
    }
    this.store.updateZone(d.id, (z) => {
      if (d.k === 'move') return { ...z, x: round05(mx - d.dx), y: round05(my - d.dy) };
      if (d.k === 'size') {
        // redimensionnement symétrique dans le repère de la forme ; Maj = carré
        const dx = mx - z.x;
        const dy = my - z.y;
        const r = -z.rot * RAD;
        const lx = dx * Math.cos(r) - dy * Math.sin(r);
        const ly = dx * Math.sin(r) + dy * Math.cos(r);
        let w = Math.max(1, round05(2 * Math.abs(lx)));
        let h = Math.max(1, round05(2 * Math.abs(ly)));
        if (e.shiftKey) w = h = Math.max(w, h);
        return { ...z, w, h };
      }
      // rotation par pas de 5° ; Maj = libre
      let a = Math.atan2(my - z.y, mx - z.x) / RAD + 90;
      if (!e.shiftKey) a = Math.round(a / 5) * 5;
      return { ...z, rot: ((a % 360) + 360) % 360 };
    });
  }

  protected up(): void {
    if (!this.drag) return;
    this.drag = null;
    this.store.commit();
  }

  private updateCursor(pt: Point): void {
    const z = this.store.selected();
    let c = 'default';
    if (this.near(pt, sunPosition(this.store.project().light, this.width, this.height), SUN_HIT)) c = 'grab';
    else if (z && (this.near(pt, zoneHandles(z, this.view).size, HANDLE_HIT) || this.near(pt, zoneHandles(z, this.view).rot, HANDLE_HIT))) c = 'pointer';
    else if (this.hitZone(pt)) c = 'move';
    if (c !== this.cursor()) this.cursor.set(c);
  }
}
