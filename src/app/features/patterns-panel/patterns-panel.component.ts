import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { clamp } from '../../core/geometry/geometry';
import { Project, STRAW_COLORS, StrawColor, strawInfo } from '../../core/model/project';
import { generatePattern, insertPattern, PatternOptions, PATTERNS, PatternType } from '../../core/patterns/patterns';
import { ProjectThumbComponent } from '../../shared/ui/project-thumb.component';
import { StrawSelectComponent } from '../../shared/ui/straw-select.component';
import { ProjectStore } from '../../state/project.store';

@Component({
  selector: 'app-patterns-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kinds" role="radiogroup" aria-label="Motif">
      @for (k of types; track k) {
        <button type="button" role="radio" class="kind" [class.on]="type() === k" [attr.aria-checked]="type() === k" (click)="setType(k)">
          <app-project-thumb [project]="thumbs()[k]" [size]="64" />
          <span>{{ patterns[k].label }}</span>
        </button>
      }
    </div>
    <figure class="preview">
      <app-project-thumb [project]="preview()" [size]="200" />
      <figcaption>Aperçu sur ce panneau{{ replace() ? '' : ', par-dessus les formes actuelles' }}</figcaption>
    </figure>
    <div class="g2 top">
      <label>
        Nombre
        <input #n type="number" [min]="meta().min" [max]="meta().max" step="1" [value]="count()" (change)="count.set(+n.value)" />
      </label>
      @if (meta().options; as opts) {
        <label>
          {{ type() === 'soleil' ? 'Origine' : 'Direction' }}
          <select #o (change)="option.set(o.value)">
            @for (op of opts; track op.value) {
              <option [value]="op.value" [selected]="option() === op.value">{{ op.label }}</option>
            }
          </select>
        </label>
      }
      <div class="col">
        <span class="cap">Couleur A</span>
        <app-straw-select label="Couleur A" [value]="colorA()" (picked)="colorA.set($event)" />
      </div>
      <div class="col">
        <span class="cap">Couleur B</span>
        <app-straw-select label="Couleur B" [value]="colorB()" (picked)="colorB.set($event)" />
      </div>
      @if (meta().usesAngles) {
        <label>
          Sens A (°)
          <input #aa type="number" min="0" max="179" [value]="angleA()" (change)="angleA.set(angle(aa.value))" />
        </label>
        <label>
          Sens B (°)
          <input #ab type="number" min="0" max="179" [value]="angleB()" (change)="angleB.set(angle(ab.value))" />
        </label>
      }
    </div>
    <label class="chk">
      <input #rp type="checkbox" [checked]="replace()" (change)="replace.set(rp.checked)" />
      Remplacer les formes existantes (les trous restent)
    </label>
    <div class="row"><button type="button" class="primary" (click)="generate()">Ajouter le motif</button></div>
    <p class="note">{{ meta().note }}</p>
  `,
  imports: [ProjectThumbComponent, StrawSelectComponent],
  styles: `
    .top { margin-top: 0; }
    .col { display: grid; gap: 3px; min-width: 0; }
    .cap { color: var(--mute); font-size: 14px; }
    .kinds { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
    .kind { flex-direction: column; height: auto; padding: 6px 4px; gap: 4px; justify-content: center; font-size: 13px; background: var(--bg); color: var(--ink); }
    .kind.on { border-color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); background: var(--bg); color: var(--ink); font-weight: 600; }
    .kind app-project-thumb { height: 56px; width: 100%; }
    .preview { margin: 10px 0 0; padding: 10px; border-radius: 10px; background: #2c5a4e; display: grid; justify-items: center; gap: 6px; }
    .preview app-project-thumb { height: 180px; width: 100%; }
    figcaption { color: #e8efe9; font-size: 13px; }
  `,
})
export class PatternsPanelComponent {
  private readonly store = inject(ProjectStore);
  protected readonly patterns = PATTERNS;
  protected readonly types = Object.keys(PATTERNS) as PatternType[];
  protected readonly colors = STRAW_COLORS;
  protected readonly info = strawInfo;

  protected readonly type = signal<PatternType>('soleil');
  protected readonly meta = computed(() => PATTERNS[this.type()]);
  protected readonly count = signal(PATTERNS.soleil.def);
  protected readonly option = signal('bas');
  protected readonly colorA = signal<StrawColor>('naturel');
  protected readonly colorB = signal<StrawColor>('ble');
  protected readonly angleA = signal(45);
  protected readonly angleB = signal(135);
  protected readonly replace = signal(true);

  private readonly options = computed<PatternOptions>(() => {
    const m = this.meta();
    const n = Number.isFinite(this.count()) ? this.count() : m.def;
    return {
      type: this.type(),
      count: clamp(Math.round(n), m.min, m.max),
      option: this.option(),
      colorA: this.colorA(),
      colorB: this.colorB(),
      angleA: this.angleA(),
      angleB: this.angleB(),
    };
  });

  /** Résultat sur le panneau courant, sans rien modifier. */
  protected readonly preview = computed<Project>(() => {
    const p = this.store.committed();
    return { ...p, zones: insertPattern(p.zones, generatePattern(this.options(), p.panel, 100000), this.replace()) };
  });

  /** Vignette de chaque motif avec ses réglages par défaut et les couleurs choisies. */
  protected readonly thumbs = computed(() => {
    const p = this.store.committed();
    const out = {} as Record<PatternType, Project>;
    for (const t of this.types) {
      const m = PATTERNS[t];
      const o: PatternOptions = { type: t, count: m.def, option: m.options?.[0]?.value, colorA: this.colorA(), colorB: this.colorB(), angleA: 45, angleB: 135 };
      out[t] = { ...p, zones: generatePattern(o, p.panel, 1) };
    }
    return out;
  });

  protected setType(v: string): void {
    const t = (Object.hasOwn(PATTERNS, v) ? v : 'soleil') as PatternType;
    this.type.set(t);
    this.count.set(PATTERNS[t].def);
    this.option.set(PATTERNS[t].options?.[0]?.value ?? '');
  }


  protected angle(v: string): number {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? clamp(n, 0, 179) : 0;
  }

  protected generate(): void {
    this.store.addPattern(this.options(), this.replace());
  }
}
