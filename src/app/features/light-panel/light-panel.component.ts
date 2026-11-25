import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import { normAngle } from '../../core/geometry/geometry';
import { BgMode, LIMITS, Project } from '../../core/model/project';
import { fmt } from '../../shared/format';
import { SegmentedComponent, SegOption } from '../../shared/ui/segmented.component';
import { SliderFieldComponent } from '../../shared/ui/slider-field.component';
import { SwatchesComponent } from '../../shared/ui/swatches.component';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

const SWEEP_MS = 6000;
const normAngle360 = (a: number) => ((Math.round(a) % 360) + 360) % 360;

@Component({
  selector: 'app-light-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SliderFieldComponent, SegmentedComponent, SwatchesComponent],
  template: `
    <app-slider-field
      label="Direction de la lumière"
      [value]="p().light"
      [display]="round(p().light) + '°'"
      [min]="0"
      [max]="359"
      [step]="1"
      (live)="live({ light: $event })"
      (committed)="store.commit()"
    />
    <div class="row">
      <button type="button" [attr.aria-pressed]="sweeping()" (click)="toggleSweep()">
        {{ sweeping() ? 'Arrêter' : 'Faire tourner la lumière' }}
      </button>
      @if (p().view === 'rendu') {
        <button type="button" [class.on]="ui.compare()" [attr.aria-pressed]="ui.compare()" (click)="ui.compare.set(!ui.compare())">
          Comparer deux lumières
        </button>
      }
    </div>
    @if (ui.compare() && p().view === 'rendu') {
      <app-slider-field
        label="Lumière B (à droite)"
        [value]="ui.lightB()"
        [display]="round(ui.lightB()) + '°'"
        [min]="0"
        [max]="359"
        [step]="1"
        (live)="ui.lightB.set($event)"
      />
      <div class="row">
        @for (pr of lightPresets(); track pr.label) {
          <button type="button" [title]="pr.title" (click)="ui.lightB.set(pr.a)">{{ pr.label }}</button>
        }
      </div>
    }
    <app-slider-field
      label="Contraste des reflets"
      [value]="p().contrast"
      [display]="round(p().contrast * 100) + ' %'"
      (live)="live({ contrast: $event })"
      (committed)="store.commit()"
    />
    @if (is3d()) {
      <app-slider-field
        label="Hauteur de la lumière"
        [value]="p().elev"
        [display]="round(p().elev) + '°'"
        [min]="limits.elev[0]"
        [max]="limits.elev[1]"
        [step]="1"
        (live)="live({ elev: $event })"
        (committed)="store.commit()"
      />
      <app-slider-field
        label="Brillance (finition)"
        [value]="p().gloss"
        [display]="glossLabel()"
        (live)="live({ gloss: $event })"
        (committed)="store.commit()"
      />
      <div class="row"><button type="button" (click)="frontView.emit()">Vue de face</button></div>
    }
    <app-slider-field
      label="Largeur des brins"
      [value]="p().sw"
      [display]="fmt(p().sw, 1) + ' mm'"
      [min]="2"
      [max]="12"
      [step]="0.5"
      (live)="live({ sw: $event })"
      (committed)="store.commit()"
    />
    <app-slider-field
      label="Irrégularité des brins"
      [value]="p().irr"
      [display]="round(p().irr * 100) + ' %'"
      (live)="live({ irr: $event })"
      (committed)="store.commit()"
    />
    <div class="lab"><span>Fond du panneau</span></div>
    <app-segmented label="Fond" [options]="bgModes" [value]="p().bg.mode" (picked)="setBg({ mode: $event }, true)" />
    @if (p().bg.mode === 'paille') {
      <div class="lab"><span>Couleur du fond</span></div>
      <app-swatches label="Couleur du fond" [value]="p().bg.color" [recent]="store.customColors()" (picked)="setBg({ color: $event }, true)" />
      <app-slider-field
        label="Sens du fil du fond"
        [value]="p().bg.angle"
        [display]="round(p().bg.angle) + '°'"
        [min]="0"
        [max]="179"
        [step]="1"
        (live)="setBg({ angle: normAngle($event) }, false)"
        (committed)="store.commit()"
      />
    }
  `,
})
export class LightPanelComponent {
  protected readonly ui = inject(UiStore);
  /** Lumière B rapportée à la première : opposée ou en travers. */
  protected readonly lightPresets = computed(() => {
    const a = this.p().light;
    return [
      { label: 'Opposée', title: 'Lumière venant de l’autre côté', a: normAngle360(a + 180) },
      { label: '+ 90°', title: 'Lumière tournée d’un quart de tour', a: normAngle360(a + 90) },
      { label: '− 90°', title: 'Lumière tournée d’un quart de tour dans l’autre sens', a: normAngle360(a - 90) },
    ];
  });
  protected readonly store = inject(ProjectStore);
  protected readonly p = this.store.project;
  protected readonly is3d = computed(() => this.p().view === '3d');
  protected readonly limits = LIMITS;
  protected readonly fmt = fmt;
  protected readonly round = Math.round;
  protected readonly normAngle = normAngle;
  protected readonly bgModes: SegOption<BgMode>[] = [
    { value: 'paille', label: 'Paille' },
    { value: 'bois', label: 'Médium nu' },
  ];
  protected readonly glossLabel = computed(() => {
    const g = this.p().gloss;
    return g < 0.3 ? 'mate' : g < 0.7 ? 'satinée' : 'vernie';
  });
  readonly frontView = output();

  protected readonly sweeping = signal(false);
  private sweepRaf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.sweepRaf));
  }

  protected live(partial: Partial<Project>): void {
    this.store.patch(partial);
  }

  protected setBg(partial: Partial<Project['bg']>, commit: boolean): void {
    this.store.update((p) => ({ ...p, bg: { ...p.bg, ...partial } }));
    if (commit) this.store.commit();
  }

  /** Un tour complet de la lumière en 6 s, puis retour à l'azimut de départ (sans historique). */
  protected toggleSweep(): void {
    if (this.sweeping()) {
      cancelAnimationFrame(this.sweepRaf);
      this.sweeping.set(false);
      this.store.commit();
      return;
    }
    const from = this.p().light;
    const t0 = performance.now();
    this.sweeping.set(true);
    const step = (now: number) => {
      const t = (now - t0) / SWEEP_MS;
      if (t < 1) {
        this.store.patch({ light: Math.round((from + 360 * t) % 360) });
        this.sweepRaf = requestAnimationFrame(step);
      } else {
        this.store.patch({ light: from });
        this.sweeping.set(false);
      }
    };
    this.sweepRaf = requestAnimationFrame(step);
  }
}
