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
import { toZoneLocal } from '../../core/geometry/fill';
import { BBox, clamp, pickAt, RAD, round05 } from '../../core/geometry/geometry';
import {
  alignTargets,
  panelKeyPoints,
  snapLength,
  snapMove,
  snapPoint,
  SnapGuides,
  zoneKeyPoints,
} from '../../core/geometry/snap';
import { defaultFill, LIMITS, Point, Zone } from '../../core/model/project';
import { drawPlanPanel } from '../../render/plan-2d.renderer';
import { azimuthAt, drawOverlay, fitView, sunPosition, zoneHandles } from '../../render/overlay-2d.renderer';
import { createFiberTexture, drawStrawPanel, toMM, ViewTransform } from '../../render/straw-2d.renderer';
import { fmt } from '../../shared/format';
import { ProjectStore } from '../../state/project.store';

interface Targets {
  xs: number[];
  ys: number[];
}

type Drag =
  | { k: 'light' }
  | { k: 'move'; id: number; dx: number; dy: number; x0: number; y0: number; box0: BBox; targets: Targets }
  /** Coin : proportions gardées (Maj = libre). */
  | { k: 'size'; id: number; ratio: number; sizes: number[] }
  /** Milieu d'un côté : une seule dimension. */
  | { k: 'sizeW'; id: number; sizes: number[] }
  | { k: 'sizeH'; id: number; sizes: number[] }
  | { k: 'rot'; id: number }
  | { k: 'center'; id: number; points: Point[]; targets: Targets };

const HANDLE_HIT = 22; // rayon de capture des poignées : cible ≥ 44 px
const SUN_HIT = 22;
/** Distance d'aimantation, en px écran. */
const SNAP_PX = 8;

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
  private guides: SnapGuides = {};

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
      guides: this.guides,
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

  /** Repères d'aimantation tirés des autres formes et du panneau. */
  private targetsExcept(id: number): Targets {
    const D = this.store.prepared();
    return alignTargets(this.store.project().panel, [...D.zones, ...D.holes].filter((o) => o.zone.id !== id));
  }

  /** Tailles des autres formes : on retrouve facilement une cote déjà utilisée. */
  private sizesExcept(id: number): number[] {
    return this.store
      .project()
      .zones.filter((o) => o.id !== id && o.type !== 'poly')
      .flatMap((o) => [o.w, o.h]);
  }

  protected down(e: PointerEvent): void {
    const pt = this.pos(e);
    const z = this.store.selected();
    this.drag = null;
    if (this.near(pt, sunPosition(this.store.project().light, this.width, this.height), SUN_HIT)) this.drag = { k: 'light' };
    else if (z) {
      const hd = zoneHandles(z, this.view);
      if (hd.center && this.near(pt, hd.center, HANDLE_HIT)) {
        const others = this.store.project().zones.filter((o) => o.id !== z.id && o.type !== 'poly');
        this.drag = {
          k: 'center',
          id: z.id,
          points: [...zoneKeyPoints(z), ...panelKeyPoints(this.store.project().panel), ...others.map((o): Point => [o.x, o.y])],
          targets: this.targetsExcept(z.id),
        };
      } else if (this.near(pt, hd.size, HANDLE_HIT)) this.drag = { k: 'size', id: z.id, ratio: z.w / z.h, sizes: this.sizesExcept(z.id) };
      else if (hd.sideW && this.near(pt, hd.sideW, HANDLE_HIT)) this.drag = { k: 'sizeW', id: z.id, sizes: this.sizesExcept(z.id) };
      else if (hd.sideH && this.near(pt, hd.sideH, HANDLE_HIT)) this.drag = { k: 'sizeH', id: z.id, sizes: this.sizesExcept(z.id) };
      else if (this.near(pt, hd.rot, HANDLE_HIT)) this.drag = { k: 'rot', id: z.id };
    }
    if (!this.drag) {
      const t = this.hitZone(pt);
      this.store.select(t?.id ?? null);
      if (t) {
        const [mx, my] = toMM(this.view, pt);
        const box = [...this.store.prepared().zones, ...this.store.prepared().holes].find((o) => o.zone.id === t.id)?.box;
        this.drag = {
          k: 'move',
          id: t.id,
          dx: mx - t.x,
          dy: my - t.y,
          x0: t.x,
          y0: t.y,
          box0: box ?? [t.x, t.y, t.x, t.y],
          targets: this.targetsExcept(t.id),
        };
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
    // Alt : pas d'aimantation
    const tol = e.altKey ? 0 : SNAP_PX / this.view.scale;
    let guides: SnapGuides = {};
    this.store.updateZone(d.id, (z) => {
      if (d.k === 'move') {
        const nx = round05(mx - d.dx);
        const ny = round05(my - d.dy);
        const ox = nx - d.x0;
        const oy = ny - d.y0;
        const box: BBox = [d.box0[0] + ox, d.box0[1] + oy, d.box0[2] + ox, d.box0[3] + oy];
        const s = snapMove(nx, ny, box, d.targets, tol);
        guides = s.guides;
        return { ...z, x: s.value[0], y: s.value[1] };
      }
      if (d.k === 'center') {
        const s = snapPoint([round05(mx), round05(my)], d.points, d.targets, tol);
        guides = s.guides;
        const [cx, cy] = toZoneLocal(z, s.value);
        const f = z.fill ?? defaultFill('eventail');
        return { ...z, fill: { ...f, cx: clamp(cx, ...LIMITS.fillCenter), cy: clamp(cy, ...LIMITS.fillCenter) } };
      }
      if (d.k === 'rot') {
        // rotation par pas de 5° ; Maj = libre
        let a = Math.atan2(my - z.y, mx - z.x) / RAD + 90;
        if (!e.shiftKey) a = Math.round(a / 5) * 5;
        return { ...z, rot: ((a % 360) + 360) % 360 };
      }
      // redimensionnement symétrique, dans le repère de la forme
      const dx = mx - z.x;
      const dy = my - z.y;
      const r = -z.rot * RAD;
      const lx = Math.abs(dx * Math.cos(r) - dy * Math.sin(r));
      const ly = Math.abs(dx * Math.sin(r) + dy * Math.cos(r));
      const fit = (v: number, others: number[]) => Math.max(1, round05(snapLength(v, others, tol)));
      if (d.k === 'sizeW') return { ...z, w: fit(2 * lx, [z.h, ...d.sizes]) };
      if (d.k === 'sizeH') return { ...z, h: fit(2 * ly, [z.w, ...d.sizes]) };
      if (e.shiftKey) {
        // Maj : proportions libres ; chaque côté s'aimante à l'autre pour retrouver un cercle
        const w = fit(2 * lx, d.sizes);
        return { ...z, w, h: fit(2 * ly, [w, ...d.sizes]) };
      }
      // proportions gardées : un cercle reste un cercle
      const w = fit(2 * Math.max(lx, ly * d.ratio), d.sizes);
      return { ...z, w, h: Math.max(1, round05(w / d.ratio)) };
    });
    this.setGuides(guides);
  }

  private setGuides(g: SnapGuides): void {
    this.guides = g;
    this.schedule();
  }

  protected up(): void {
    if (!this.drag) return;
    this.drag = null;
    this.setGuides({});
    this.store.commit();
  }

  private updateCursor(pt: Point): void {
    const z = this.store.selected();
    let c = 'default';
    if (this.near(pt, sunPosition(this.store.project().light, this.width, this.height), SUN_HIT)) c = 'grab';
    else if (z) {
      const hd = zoneHandles(z, this.view);
      if (hd.center && this.near(pt, hd.center, HANDLE_HIT)) c = 'crosshair';
      else if (this.near(pt, hd.size, HANDLE_HIT)) c = 'nwse-resize';
      else if (hd.sideW && this.near(pt, hd.sideW, HANDLE_HIT)) c = z.rot % 180 === 0 ? 'ew-resize' : 'pointer';
      else if (hd.sideH && this.near(pt, hd.sideH, HANDLE_HIT)) c = z.rot % 180 === 0 ? 'ns-resize' : 'pointer';
      else if (this.near(pt, hd.rot, HANDLE_HIT)) c = 'pointer';
      else if (this.hitZone(pt)) c = 'move';
    }
    else if (this.hitZone(pt)) c = 'move';
    if (c !== this.cursor()) this.cursor.set(c);
  }
}
