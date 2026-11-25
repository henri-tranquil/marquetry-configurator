import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { fillCenter } from '../../core/geometry/fill';
import { PALETTE } from '../../core/model/project';
import { fmt, fmtArea } from '../../shared/format';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

/** Pose guidée : une zone à la fois, dans l'ordre de pose, avec ce qu'il faut savoir pour la poser. */
@Component({
  selector: 'app-guide-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (step(); as s) {
      <section class="card" aria-labelledby="guide-title" aria-live="polite">
        <div class="top">
          <span class="count">Étape {{ index() + 1 }} / {{ total() }}</span>
          <button type="button" class="close" aria-label="Quitter la pose guidée" (click)="ui.guideStep.set(null)">✕</button>
        </div>
        <h2 id="guide-title"><span class="num">{{ s.number }}</span> {{ s.zone.name }}</h2>
        <dl>
          <div><dt>Paille</dt><dd><i class="dot" [style.--c]="palette[s.zone.color].hex"></i>{{ palette[s.zone.color].label }}</dd></div>
          <div><dt>Brins</dt><dd>{{ how() }}</dd></div>
          <div><dt>Surface visible</dt><dd>{{ fmtArea(s.usage.area) }}</dd></div>
          <div><dt>Bande</dt><dd>≈ {{ fmt(s.usage.meters, 1) }} m de {{ fmt(store.committed().sw, 1) }} mm</dd></div>
        </dl>
        <div class="nav">
          <button type="button" [disabled]="index() === 0" (click)="go(-1)">← Précédente</button>
          <button type="button" class="primary" [disabled]="index() === total() - 1" (click)="go(1)">Suivante →</button>
        </div>
        <p class="note">Flèches ← → pour avancer, Échap pour quitter.</p>
      </section>
    }
  `,
  styles: `
    .card {
      position: absolute; left: 12px; bottom: 12px; z-index: 4; width: min(340px, calc(100% - 24px));
      background: var(--bg); color: var(--ink); border-radius: 12px; padding: 14px 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .top { display: flex; justify-content: space-between; align-items: center; color: var(--mute); font-size: 13px; }
    .close { border: 0; min-width: 44px; justify-content: center; background: transparent; }
    h2 { margin: 2px 0 10px; display: flex; align-items: center; gap: 10px; }
    .num { display: inline-grid; place-items: center; min-width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--ink); font-size: 14px; }
    dl { margin: 0; display: grid; gap: 6px; }
    dl div { display: flex; justify-content: space-between; gap: 12px; }
    dt { color: var(--mute); }
    dd { margin: 0; display: flex; align-items: center; gap: 6px; text-align: right; font-variant-numeric: tabular-nums; }
    .nav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .nav button { justify-content: center; }
  `,
})
export class GuideCardComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly ui = inject(UiStore);
  protected readonly palette = PALETTE;
  protected readonly fmt = fmt;
  protected readonly fmtArea = fmtArea;
  protected readonly total = computed(() => this.store.layingSteps().length);
  protected readonly index = computed(() => Math.min(this.ui.guideStep() ?? 0, Math.max(0, this.total() - 1)));
  protected readonly step = computed(() => (this.ui.guideStep() === null ? null : (this.store.layingSteps()[this.index()] ?? null)));

  protected readonly how = computed(() => {
    const z = this.step()?.zone;
    if (!z) return '';
    switch (z.fill?.type) {
      case 'eventail': {
        const [x, y] = fillCenter(z);
        return `en éventail depuis (${fmt(x)} ; ${fmt(y)}) mm`;
      }
      case 'chevron':
        return `chevron, axe ${Math.round(z.angle)}°, ± ${Math.round(z.fill.open)}°, bandes de ${fmt(z.fill.band)} mm`;
      default:
        return `parallèles à ${Math.round(z.angle)}°`;
    }
  });

  go(d: 1 | -1): void {
    const n = this.total();
    if (!n) return;
    this.ui.guideStep.set(Math.min(n - 1, Math.max(0, this.index() + d)));
  }
}
