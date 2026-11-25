import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { clamp } from '../../core/geometry/geometry';
import { PALETTE, STRAW_COLORS, StrawColor } from '../../core/model/project';
import { PATTERNS, PatternType } from '../../core/patterns/patterns';
import { ProjectStore } from '../../state/project.store';

@Component({
  selector: 'app-patterns-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g2 top">
      <label>
        Motif
        <select #t [value]="type()" (change)="setType(t.value)">
          @for (k of types; track k) {
            <option [value]="k">{{ patterns[k].label }}</option>
          }
        </select>
      </label>
      <label>
        Nombre
        <input #n type="number" [min]="meta().min" [max]="meta().max" step="1" [value]="count()" (change)="count.set(+n.value)" />
      </label>
      @if (meta().options; as opts) {
        <label>
          {{ type() === 'soleil' ? 'Origine' : 'Direction' }}
          <select #o [value]="option()" (change)="option.set(o.value)">
            @for (op of opts; track op.value) {
              <option [value]="op.value">{{ op.label }}</option>
            }
          </select>
        </label>
      }
      <label>
        Couleur A
        <select #a [value]="colorA()" (change)="colorA.set(asColor(a.value))">
          @for (c of colors; track c) {
            <option [value]="c">{{ palette[c].label }}</option>
          }
        </select>
      </label>
      <label>
        Couleur B
        <select #b [value]="colorB()" (change)="colorB.set(asColor(b.value))">
          @for (c of colors; track c) {
            <option [value]="c">{{ palette[c].label }}</option>
          }
        </select>
      </label>
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
  styles: `.top { margin-top: 0; }`,
})
export class PatternsPanelComponent {
  private readonly store = inject(ProjectStore);
  protected readonly patterns = PATTERNS;
  protected readonly types = Object.keys(PATTERNS) as PatternType[];
  protected readonly colors = STRAW_COLORS;
  protected readonly palette = PALETTE;

  protected readonly type = signal<PatternType>('soleil');
  protected readonly meta = computed(() => PATTERNS[this.type()]);
  protected readonly count = signal(PATTERNS.soleil.def);
  protected readonly option = signal('bas');
  protected readonly colorA = signal<StrawColor>('naturel');
  protected readonly colorB = signal<StrawColor>('ble');
  protected readonly angleA = signal(45);
  protected readonly angleB = signal(135);
  protected readonly replace = signal(true);

  protected setType(v: string): void {
    const t = (Object.hasOwn(PATTERNS, v) ? v : 'soleil') as PatternType;
    this.type.set(t);
    this.count.set(PATTERNS[t].def);
    this.option.set(PATTERNS[t].options?.[0]?.value ?? '');
  }

  protected asColor(v: string): StrawColor {
    return (STRAW_COLORS as readonly string[]).includes(v) ? (v as StrawColor) : 'naturel';
  }

  protected angle(v: string): number {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? clamp(n, 0, 179) : 0;
  }

  protected generate(): void {
    const m = this.meta();
    const n = Number.isFinite(this.count()) ? this.count() : m.def;
    this.store.addPattern(
      {
        type: this.type(),
        count: clamp(Math.round(n), m.min, m.max),
        option: this.option(),
        colorA: this.colorA(),
        colorB: this.colorB(),
        angleA: this.angleA(),
        angleB: this.angleB(),
      },
      this.replace(),
    );
  }
}
