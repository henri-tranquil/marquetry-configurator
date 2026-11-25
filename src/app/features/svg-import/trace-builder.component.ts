import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, input, model, signal, viewChild } from '@angular/core';
import { CellGrid } from '../../core/import/trace-cells';
import { TRACE_ROLE_LABELS, TraceRole, TraceZone } from '../../core/import/trace-plan';
import { STRAW_COLORS, StrawColor, strawInfo, WOOD_HEX } from '../../core/model/project';
import { StrawSelectComponent } from '../../shared/ui/straw-select.component';

const SELECT_HEX = '#ff7a6b';
const FREE_HEX = '#f6f1e7';
const OUTSIDE_HEX = '#2c5a4e';
const HOLE_HEX = '#34302c';

function rgb(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  // ImageData en mémoire : octets R, G, B, A → entier petit-boutiste ABGR
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
}

/**
 * Construction de zones à partir d'un dessin au trait : on peint des cases (espaces fermés entre les traits),
 * puis on en fait une zone (plaque, paille ou trou). La plaque est un calque à part : les zones de paille
 * et les trous se posent dessus.
 */
@Component({
  selector: 'app-trace-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StrawSelectComponent],
  template: `
    <div class="stage">
      <canvas
        #cv
        role="img"
        aria-label="Dessin découpé en cases : clique ou glisse pour sélectionner"
        (pointerdown)="down($event)"
        (pointermove)="paint($event)"
        (pointerup)="painting = null"
        (pointercancel)="painting = null"
      ></canvas>
    </div>
    <div class="selbar">
      <span class="count" role="status">{{ selection().size }} case{{ selection().size > 1 ? 's' : '' }} sélectionnée{{ selection().size > 1 ? 's' : '' }}</span>
      <button type="button" (click)="selectFree()">Cases libres</button>
      <button type="button" (click)="selectAll()">Tout le dessin</button>
      <button type="button" [disabled]="!selection().size" (click)="selection.set(empty)">Vider</button>
    </div>

    <fieldset class="make">
      <legend>Nouvelle zone avec la sélection</legend>
      <div class="roles" role="radiogroup" aria-label="Rôle de la zone">
        @for (r of roleList; track r) {
          <button type="button" role="radio" [class.on]="role() === r" [attr.aria-checked]="role() === r" (click)="setRole(r)">{{ roleLabels[r] }}</button>
        }
      </div>
      <div class="line">
        <input #nm type="text" maxlength="40" aria-label="Nom de la zone" [value]="name()" (input)="name.set(nm.value)" />
        @if (role() === 'motif') {
          <app-straw-select label="Paille de la zone" [value]="color()" (picked)="color.set($event)" />
        }
      </div>
      <button type="button" class="primary" [disabled]="!selection().size" (click)="create()">
        {{ editing() ? 'Mettre à jour' : 'Créer' }} « {{ name() || roleLabels[role()] }} »
      </button>
      @if (role() === 'plaque') {
        <p class="note">La plaque est le contour du panneau. Les zones de paille et les trous se posent dessus : leurs cases peuvent en faire partie.</p>
      }
    </fieldset>

    @if (zones().length) {
      <ul class="zones" aria-label="Zones construites">
        @for (z of zones(); track z.id) {
          <li>
            <i class="dot" [class.hole]="z.role === 'trou'" [style.--c]="hex(z)"></i>
            <span class="nm">{{ z.name }}</span>
            <span class="meta">{{ roleLabels[z.role] }} · {{ z.cells.length }} case{{ z.cells.length > 1 ? 's' : '' }}</span>
            <button type="button" title="Reprendre ses cases pour la modifier" (click)="edit(z)">Modifier</button>
            <button type="button" class="x" [attr.aria-label]="'Supprimer ' + z.name" (click)="remove(z.id)">✕</button>
          </li>
        }
      </ul>
    } @else {
      <p class="note">
        Clique ou glisse sur les cases qui forment la plaque, crée la zone « Plaque », puis recommence pour chaque partie du
        dessin (le bec, l'aile…). Les cases non utilisées restent en médium.
      </p>
    }
  `,
  styles: `
    :host { display: grid; gap: 8px; align-content: start; min-width: 0; }
    .stage { background: ${OUTSIDE_HEX}; border-radius: 10px; padding: 8px; display: grid; place-items: center; }
    canvas { max-width: 100%; max-height: 340px; touch-action: none; cursor: crosshair; image-rendering: auto; }
    .selbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .selbar .count { flex: 1; color: var(--mute); font-size: 13px; min-width: 9em; }
    .selbar button { padding: 0 10px; font-size: 14px; }
    fieldset { border: 1px solid var(--line); border-radius: 10px; margin: 0; padding: 8px 12px 10px; display: grid; gap: 8px; min-width: 0; }
    legend { color: var(--mute); font-size: 13px; padding: 0 4px; }
    .roles { display: flex; }
    .roles button { flex: 1; justify-content: center; border-radius: 0; margin-left: -1px; }
    .roles button:first-child { border-radius: 8px 0 0 8px; }
    .roles button:last-child { border-radius: 0 8px 8px 0; }
    .line { display: flex; gap: 8px; align-items: center; }
    .line input { flex: 1; min-width: 0; }
    .line app-straw-select { flex: 1.3; min-width: 0; }
    .make > .primary { justify-content: center; }
    .zones { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 200px; overflow: auto; }
    .zones li { display: flex; align-items: center; gap: 8px; }
    .zones .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .zones .meta { color: var(--mute); font-size: 13px; margin-left: auto; white-space: nowrap; }
    .zones button { padding: 0 10px; font-size: 14px; min-height: 40px; }
    .x { min-width: 40px; justify-content: center; }
    .dot { width: 20px; height: 20px; flex: none; }
    .dot.hole { border-radius: 4px; }
    .note { margin: 0; }
  `,
})
export class TraceBuilderComponent {
  readonly grid = input.required<CellGrid>();
  readonly zones = model<TraceZone[]>([]);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');

  protected readonly roleLabels = TRACE_ROLE_LABELS;
  protected readonly roleList: TraceRole[] = ['plaque', 'motif', 'trou'];
  protected readonly empty: ReadonlySet<number> = new Set();
  protected readonly selection = signal<ReadonlySet<number>>(new Set());
  protected readonly role = signal<TraceRole>('plaque');
  protected readonly name = signal('Plaque');
  protected readonly color = signal<StrawColor>('naturel');
  /** Zone en cours de modification (ses cases ont été reprises). */
  protected readonly editing = signal<TraceZone | null>(null);
  protected painting: 'add' | 'remove' | null = null;

  /** Zone de paille ou trou qui occupe chaque case (la plaque est un calque à part). */
  private readonly owner = computed(() => {
    const m = new Map<number, TraceZone>();
    for (const z of this.zones()) if (z.role !== 'plaque') for (const c of z.cells) m.set(c, z);
    return m;
  });
  private readonly plateCells = computed(() => new Set(this.zones().find((z) => z.role === 'plaque')?.cells ?? []));

  constructor() {
    afterRenderEffect(() => this.draw());
  }

  protected hex(z: TraceZone): string {
    return z.role === 'plaque' ? WOOD_HEX : z.role === 'trou' ? HOLE_HEX : strawInfo(z.color).hex;
  }

  private draw(): void {
    const g = this.grid();
    const c = this.canvas().nativeElement;
    if (c.width !== g.w || c.height !== g.h) {
      c.width = g.w;
      c.height = g.h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const sel = this.selection();
    const owner = this.owner();
    const plate = this.plateCells();
    const colors = new Uint32Array(g.count + 1);
    for (let k = 1; k <= g.count; k++) {
      const z = owner.get(k);
      colors[k] = rgb(
        sel.has(k) ? SELECT_HEX : z ? this.hex(z) : plate.has(k) ? WOOD_HEX : g.outside.has(k) ? OUTSIDE_HEX : FREE_HEX,
      );
    }
    const img = ctx.createImageData(g.w, g.h);
    const px = new Uint32Array(img.data.buffer);
    const ink = rgb('#1d1a17');
    for (let i = 0; i < px.length; i++) px[i] = g.ink[i] ? ink : colors[g.labels[i]!]!;
    ctx.putImageData(img, 0, 0);
  }

  private cellAtEvent(e: PointerEvent): number {
    const g = this.grid();
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * g.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * g.h);
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0;
    const k = g.labels[y * g.w + x]!;
    return g.outside.has(k) ? 0 : k;
  }

  protected down(e: PointerEvent): void {
    const k = this.cellAtEvent(e);
    if (!k) return;
    this.painting = this.selection().has(k) ? 'remove' : 'add';
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    this.apply(k);
  }

  protected paint(e: PointerEvent): void {
    if (!this.painting) return;
    const k = this.cellAtEvent(e);
    if (k) this.apply(k);
  }

  private apply(k: number): void {
    const s = this.selection();
    if (this.painting === 'add' && !s.has(k)) this.selection.set(new Set([...s, k]));
    if (this.painting === 'remove' && s.has(k)) {
      const n = new Set(s);
      n.delete(k);
      this.selection.set(n);
    }
  }

  private inner(): number[] {
    const g = this.grid();
    return Array.from({ length: g.count }, (_, i) => i + 1).filter((k) => !g.outside.has(k));
  }

  protected selectAll(): void {
    this.selection.set(new Set(this.inner()));
  }

  /** Cases sans zone de paille ni trou (dans la plaque si elle existe). */
  protected selectFree(): void {
    const owner = this.owner();
    const plate = this.plateCells();
    this.selection.set(new Set(this.inner().filter((k) => !owner.has(k) && (!plate.size || plate.has(k)))));
  }

  protected setRole(r: TraceRole): void {
    this.role.set(r);
    if (!this.editing()) this.name.set(this.defaultName(r));
  }

  private defaultName(r: TraceRole): string {
    if (r === 'plaque') return 'Plaque';
    const n = this.zones().filter((z) => z.role === r).length + 1;
    return r === 'trou' ? `Trou ${n}` : `Zone ${n}`;
  }

  protected create(): void {
    const cells = [...this.selection()];
    if (!cells.length) return;
    const role = this.role();
    const prev = this.editing();
    const id = prev?.id ?? Math.max(0, ...this.zones().map((z) => z.id)) + 1;
    const zone: TraceZone = { id, name: (this.name().trim() || TRACE_ROLE_LABELS[role]).slice(0, 40), role, color: this.color(), cells };
    const taken = new Set(cells);
    this.zones.update((zs) => {
      const rest = zs
        .filter((z) => z.id !== id && !(role === 'plaque' && z.role === 'plaque'))
        // une case n'a qu'une zone de paille ou de trou ; la plaque reste un calque à part
        .map((z) => (role === 'plaque' || z.role === 'plaque' ? z : { ...z, cells: z.cells.filter((c) => !taken.has(c)) }))
        .filter((z) => z.cells.length);
      const at = prev ? zs.findIndex((z) => z.id === id) : -1;
      if (at >= 0) rest.splice(Math.min(at, rest.length), 0, zone);
      else rest.push(zone);
      return rest;
    });
    this.selection.set(new Set());
    this.editing.set(null);
    // suite logique : après la plaque, des zones de paille, avec une autre paille à chaque fois
    const next: TraceRole = role === 'plaque' ? 'motif' : role;
    this.role.set(next);
    this.name.set(this.defaultName(next));
    if (role === 'motif' || next === 'motif') {
      const used = new Set(this.zones().map((z) => z.color));
      this.color.set(STRAW_COLORS.find((c) => !used.has(c)) ?? 'naturel');
    }
  }

  protected edit(z: TraceZone): void {
    this.editing.set(z);
    this.selection.set(new Set(z.cells));
    this.role.set(z.role);
    this.name.set(z.name);
    this.color.set(z.color);
  }

  protected remove(id: number): void {
    this.zones.update((zs) => zs.filter((z) => z.id !== id));
    if (this.editing()?.id === id) this.editing.set(null);
  }
}
