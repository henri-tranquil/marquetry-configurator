import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { fmt, fmtArea } from '../../shared/format';
import { ProjectStore } from '../../state/project.store';

@Component({
  selector: 'app-bom-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = store.bom();
    @let sw = store.committed().sw;
    @for (r of b.rows; track r.key) {
      <div class="bm">
        <i class="dot" [style.--c]="r.hex"></i>
        <span>{{ r.label }}</span>
        <span class="v">{{ fmtArea(r.area) }}</span>
        <span class="v">{{ r.key === 'bois' ? '–' : '≈ ' + fmt(r.meters, 1) + ' m' }}</span>
        <span class="bar"><b [style.width.%]="r.share * 100" [style.--c]="r.hex"></b></span>
      </div>
    }
    @if (b.profileArea > 0) {
      <div class="bm">
        <i class="dot" style="--c: #c9a35a"></i>
        <span>Profils (en plus)</span>
        <span class="v">{{ fmt(b.profileArea / 100) }} cm²</span>
        <span class="v">≈ {{ fmt(b.profileMeters, 1) }} m</span>
      </div>
    }
    <div class="tot">
      <span>Bandes de {{ fmt(sw, 1) }} mm, chute comprise</span>
      <span>≈ {{ fmt(b.totalMeters, 1) }} m</span>
    </div>
    <p class="note">
      Panneau {{ fmt(b.panelArea / 1e4, 2) }} dm²@if (b.holeArea > 0) {, dont {{ fmt(b.holeArea / 100) }} cm² de trous}.
      Estimation par échantillonnage, plus 15 % de chute.
    </p>
  `,
  styles: `
    .bm { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; gap: 4px 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
    .v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bar { grid-column: 2 / -1; height: 6px; background: var(--soft); border-radius: 3px; overflow: hidden; }
    .bar b { display: block; height: 100%; background: var(--c); }
    .tot { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; font-weight: 600; }
    .tot span:last-child { white-space: nowrap; }
  `,
})
export class BomPanelComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly fmt = fmt;
  protected readonly fmtArea = fmtArea;
}
