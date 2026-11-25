import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
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
import { defaultFill, LIMITS, Point, Project, Zone } from '../../core/model/project';
import { drawPlanPanel } from '../../render/plan-2d.renderer';
import {
  azimuthAt,
  drawOverlay,
  sunPosition,
  zoneHandles,
  zoomAt,
  zoomedView,
  ZoomState,
} from '../../render/overlay-2d.renderer';
import { createFiberTexture, drawStrawPanel, toMM, ViewTransform } from '../../render/straw-2d.renderer';
import { fmt } from '../../shared/format';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

interface Targets {
  xs: number[];
  ys: number[];
}

type Drag =
  | { k: 'light' }
  | { k: 'lightB' }
  | { k: 'move'; id: number; dx: number; dy: number; x0: number; y0: number; box0: BBox; targets: Targets }
  /** Coin : proportions gardées (Maj = libre). */
  | { k: 'size'; id: number; ratio: number; sizes: number[] }
  /** Milieu d'un côté : une seule dimension. */
  | { k: 'sizeW'; id: number; sizes: number[] }
  | { k: 'sizeH'; id: number; sizes: number[] }
  | { k: 'rot'; id: number }
  | { k: 'center'; id: number; points: Point[]; targets: Targets }
  /** Déplacement de la vue (glisser sur le tapis, ou bouton du milieu). */
  | { k: 'pan'; start: Point; pan0: Point; moved: boolean };

const HANDLE_HIT = 22; // rayon de capture des poignées : cible ≥ 44 px
const SUN_HIT = 22;
/** Distance d'aimantation, en px écran. */
const SNAP_PX = 8;
const FIT: ZoomState = { zoom: 1, panX: 0, panY: 0 };

/** Canvas 2D de l'éditeur : rendu paille ou plan de pose, sélection, poignées, zoom. */
@Component({
  selector: 'app-stage-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'dropping.set(false)',
    '(drop)': 'onDrop($event)',
    '[class.dropping]': 'dropping()',
  },
  template: `
    <canvas
      #cv
      [style.cursor]="cursor()"
      [attr.aria-label]="store.project().view === 'plan' ? 'Plan de pose du panneau' : 'Aperçu du panneau en marqueterie de paille'"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="up($event)"
      (wheel)="wheel($event)"
      (dblclick)="dbl($event)"
      (contextmenu)="context($event)"
    ></canvas>
    @if (dropping()) {
      <div class="drop" aria-hidden="true">Dépose le fichier SVG pour l'importer</div>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    .drop {
      position: absolute; inset: 12px; display: grid; place-items: center; border: 2px dashed #fff; border-radius: 12px;
      background: rgba(0, 0, 0, 0.35); color: #fff; font-weight: 600; pointer-events: none;
    }
  `,
})
export class StageCanvasComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly ui = inject(UiStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  protected readonly cursor = signal('default');
  protected readonly dropping = signal(false);
  private readonly zoomState = signal<ZoomState>(FIT);
  /** Comparaison active : seulement en rendu paille. */
  private readonly comparing = computed(() => this.ui.compare() && this.store.project().view === 'rendu');

  private ctx: CanvasRenderingContext2D | null = null;
  private fiber: CanvasPattern | null = null;
  private view: ViewTransform = { scale: 1, ox: 0, oy: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private drag: Drag | null = null;
  private guides: SnapGuides = {};
  private panelKey = '';
  private readonly pointers = new Map<number, Point>();
  private pinch = 0;

  constructor() {
    effect(() => {
      // dépendances : tout ce qui change l'image
      this.store.project();
      this.store.selected();
      this.store.prepared();
      this.zoomState();
      this.comparing();
      this.ui.lightB();
      this.ui.guideStep();
      this.schedule();
    });
    effect(() => this.ui.zoomLevel.set(this.zoomState().zoom));
    effect(() => {
      const r = this.ui.zoomRequest();
      if (!r) return;
      untracked(() => this.applyZoomRequest(r.kind));
    });
    afterNextRender(() => {
      const c = this.canvas().nativeElement;
      this.ctx = c.getContext('2d');
      this.fiber = this.ctx?.createPattern(createFiberTexture(), 'repeat') ?? null;
      const ro = new ResizeObserver(() => this.render());
      ro.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
      document.fonts?.ready.then(() => this.schedule());
    });
    this.destroyRef.onDestroy(() => cancelAnimationFrame(this.raf));
  }

  /** Largeur utile d'une vue (moitié en comparaison). */
  private get viewWidth(): number {
    return this.comparing() ? this.width / 2 : this.width;
  }

  private layout(): void {
    const fig = this.host.nativeElement.parentElement;
    const r = this.host.nativeElement.getBoundingClientRect();
    const c = this.canvas().nativeElement;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width !== this.width || r.height !== this.height) {
      this.width = r.width;
      this.height = r.height;
      c.width = Math.max(1, Math.round(this.width * this.dpr));
      c.height = Math.max(1, Math.round(this.height * this.dpr));
    }
    const p = this.store.project();
    // nouvelles dimensions de panneau : on revient à la vue ajustée
    const key = `${p.panel.w}x${p.panel.h}`;
    if (key !== this.panelKey) {
      this.panelKey = key;
      if (this.zoomState() !== FIT) this.zoomState.set(FIT);
    }
    const { view, grid } = zoomedView(p, this.viewWidth, this.height, this.zoomState());
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
    if (!ctx) return;
    this.layout();
    if (!this.width) return;
    const p = this.store.project();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const D = this.store.prepared();
    const font = '500 13px Archivo, system-ui, sans-serif';
    if (p.view === 'plan') {
      const step = this.ui.guideStep();
      const focus = step === null ? null : (this.store.layingSteps()[step]?.zone.id ?? null);
      drawPlanPanel(ctx, p, D, { view: this.view, font: '600 12px Archivo, system-ui, sans-serif', focusZoneId: focus });
    } else drawStrawPanel(ctx, p, D, { view: this.view, fiber: this.fiber, decorations: true, mode: 'shaded' });

    const compare = this.comparing();
    drawOverlay(ctx, p, {
      view: this.view,
      width: this.viewWidth,
      height: this.height,
      selected: this.ui.guideStep() === null ? this.store.selected() : null,
      guides: this.guides,
      font,
      format: (v) => fmt(v),
      caption: compare ? `Lumière A · ${Math.round(p.light)}°` : undefined,
    });

    if (compare) {
      // même panneau, seconde lumière, dans la moitié droite
      const half = this.width / 2;
      const pB: Project = { ...p, light: this.ui.lightB() };
      ctx.save();
      ctx.translate(half, 0);
      ctx.beginPath();
      ctx.rect(0, 0, half, this.height);
      ctx.clip();
      ctx.fillStyle = '#2c5a4e';
      ctx.fillRect(0, 0, half, this.height);
      drawStrawPanel(ctx, pB, D, { view: this.view, fiber: this.fiber, decorations: true, mode: 'shaded' });
      drawOverlay(ctx, pB, {
        view: this.view,
        width: half,
        height: this.height,
        selected: null,
        font,
        format: (v) => fmt(v),
        caption: `Lumière B · ${Math.round(pB.light)}°`,
      });
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(half - 0.5, 0, 1, this.height);
    }
  }

  /* ---------- zoom ---------- */

  private applyZoomRequest(kind: 'in' | 'out' | 'fit'): void {
    if (kind === 'fit') this.zoomState.set(FIT);
    else this.zoomBy(kind === 'in' ? 1.25 : 0.8, [this.viewWidth / 2, this.height / 2]);
  }

  private zoomBy(factor: number, at: Point): void {
    this.zoomState.set(zoomAt(this.store.project(), this.viewWidth, this.height, this.zoomState(), factor, at));
  }

  protected wheel(e: WheelEvent): void {
    e.preventDefault();
    const pt = this.pos(e);
    if (pt[0] > this.viewWidth) return;
    // pavé tactile : Ctrl+molette = pincement, molette seule = déplacement
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) / 2 && e.deltaMode === 0 && Math.abs(e.deltaY) < 40) {
      const z = this.zoomState();
      this.zoomState.set({ ...z, panX: z.panX - e.deltaX, panY: z.panY - e.deltaY });
      return;
    }
    this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), pt);
  }

  protected dbl(e: MouseEvent): void {
    // double-clic sur le tapis : vue ajustée
    if (!this.hitZone(this.pos(e))) this.zoomState.set(FIT);
  }

  /* ---------- pointeur ---------- */

  private pos(e: MouseEvent): Point {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private near(a: Point, b: Point, r: number): boolean {
    return Math.hypot(a[0] - b[0], a[1] - b[1]) < r;
  }

  private hitZone(pt: Point): Zone | null {
    if (pt[0] > this.viewWidth) return null;
    const [x, y] = toMM(this.view, pt);
    return pickAt(this.store.prepared(), this.store.project().panel, x, y);
  }

  private sunA(): Point {
    return sunPosition(this.store.project().light, this.viewWidth, this.height);
  }

  private sunB(): Point | null {
    if (!this.comparing()) return null;
    const [x, y] = sunPosition(this.ui.lightB(), this.width / 2, this.height);
    return [x + this.width / 2, y];
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

  /** Pendant la pose guidée, le plan est en lecture seule. */
  private get readOnly(): boolean {
    return this.ui.guideStep() !== null;
  }

  protected down(e: PointerEvent): void {
    const pt = this.pos(e);
    this.ui.menu.set(null);
    this.pointers.set(e.pointerId, pt);
    if (this.pointers.size === 2) {
      // deuxième doigt : pincement, on abandonne le geste en cours
      if (this.drag && this.drag.k !== 'pan') this.store.revert();
      this.drag = null;
      this.pinch = 0;
      return;
    }
    if (e.button === 2) return;
    this.drag = null;
    const z = this.store.selected();
    const sb = this.sunB();
    if (e.button === 1) this.startPan(pt);
    else if (this.near(pt, this.sunA(), SUN_HIT)) this.drag = { k: 'light' };
    else if (sb && this.near(pt, sb, SUN_HIT)) this.drag = { k: 'lightB' };
    else if (z && !this.readOnly) {
      const hd = zoneHandles(z, this.view, this.store.project().panel);
      if (hd.center && this.near(pt, hd.center, HANDLE_HIT)) {
        const others = this.store.project().zones.filter((o) => o.id !== z.id && o.type !== 'poly');
        this.drag = {
          k: 'center',
          id: z.id,
          points: [...zoneKeyPoints(z), ...panelKeyPoints(this.store.project().panel), ...others.map((o): Point => [o.x, o.y])],
          targets: this.targetsExcept(z.id),
        };
      } else if (hd.transformable) {
        if (this.near(pt, hd.size, HANDLE_HIT)) this.drag = { k: 'size', id: z.id, ratio: z.w / z.h, sizes: this.sizesExcept(z.id) };
        else if (hd.sideW && this.near(pt, hd.sideW, HANDLE_HIT)) this.drag = { k: 'sizeW', id: z.id, sizes: this.sizesExcept(z.id) };
        else if (hd.sideH && this.near(pt, hd.sideH, HANDLE_HIT)) this.drag = { k: 'sizeH', id: z.id, sizes: this.sizesExcept(z.id) };
        else if (this.near(pt, hd.rot, HANDLE_HIT)) this.drag = { k: 'rot', id: z.id };
      }
    }
    if (!this.drag) {
      const t = this.readOnly ? null : this.hitZone(pt);
      if (t) {
        this.store.select(t.id);
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
      } else this.startPan(pt);
    }
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private startPan(pt: Point): void {
    const z = this.zoomState();
    this.drag = { k: 'pan', start: pt, pan0: [z.panX, z.panY], moved: false };
  }

  protected move(e: PointerEvent): void {
    const pt = this.pos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pt);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (this.pinch) this.zoomBy(d / this.pinch, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      this.pinch = d;
      return;
    }
    const d = this.drag;
    if (!d) {
      this.updateCursor(pt);
      return;
    }
    if (d.k === 'pan') {
      const dx = pt[0] - d.start[0];
      const dy = pt[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      this.cursor.set('grabbing');
      this.zoomState.update((z) => ({ ...z, panX: d.pan0[0] + dx, panY: d.pan0[1] + dy }));
      return;
    }
    const [mx, my] = toMM(this.view, pt);
    if (d.k === 'light') {
      this.store.patch({ light: azimuthAt(pt[0], pt[1], this.viewWidth, this.height) });
      return;
    }
    if (d.k === 'lightB') {
      this.ui.lightB.set(azimuthAt(pt[0] - this.width / 2, pt[1], this.width / 2, this.height));
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

  protected up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.k === 'pan') {
      // simple clic sur le tapis : désélection
      if (!d.moved && !this.readOnly) this.store.select(null);
      this.updateCursor(this.pos(e));
      return;
    }
    if (d.k === 'lightB') return;
    this.setGuides({});
    this.store.commit();
  }

  protected context(e: MouseEvent): void {
    e.preventDefault();
    if (this.readOnly) return;
    const pt = this.pos(e);
    const t = this.hitZone(pt);
    this.store.select(t?.id ?? null);
    if (!t) return;
    const fig = this.host.nativeElement.getBoundingClientRect();
    this.ui.menu.set({ x: e.clientX - fig.left, y: e.clientY - fig.top });
  }

  private updateCursor(pt: Point): void {
    const z = this.store.selected();
    let c = this.zoomState().zoom > 1 ? 'grab' : 'default';
    const sb = this.sunB();
    if (this.near(pt, this.sunA(), SUN_HIT) || (sb && this.near(pt, sb, SUN_HIT))) c = 'grab';
    else if (this.readOnly) c = 'default';
    else {
      const hd = z ? zoneHandles(z, this.view, this.store.project().panel) : null;
      if (hd?.center && this.near(pt, hd.center, HANDLE_HIT)) c = 'crosshair';
      else if (hd?.transformable && this.near(pt, hd.size, HANDLE_HIT)) c = 'nwse-resize';
      else if (hd?.transformable && hd.sideW && this.near(pt, hd.sideW, HANDLE_HIT)) c = z?.rot === 0 ? 'ew-resize' : 'pointer';
      else if (hd?.transformable && hd.sideH && this.near(pt, hd.sideH, HANDLE_HIT)) c = z?.rot === 0 ? 'ns-resize' : 'pointer';
      else if (hd?.transformable && this.near(pt, hd.rot, HANDLE_HIT)) c = 'pointer';
      else if (this.hitZone(pt)) c = 'move';
    }
    if (c !== this.cursor()) this.cursor.set(c);
  }

  /* ---------- dépôt d'un fichier SVG ---------- */

  protected onDragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.dropping.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dropping.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this.ui.svgFile.set(f);
  }
}
