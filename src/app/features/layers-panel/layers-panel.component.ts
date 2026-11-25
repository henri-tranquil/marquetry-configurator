import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { isNarrow } from '../../core/geometry/geometry';
import { PALETTE } from '../../core/model/project';
import { ProjectStore } from '../../state/project.store';

@Component({
  selector: 'app-layers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    @if (rows().length) {
      <ul class="layers" cdkDropList (cdkDropListDropped)="drop($event)" aria-label="Calques, du premier plan au fond">
        @for (r of rows(); track r.zone.id) {
          <li cdkDrag cdkDragLockAxis="y" [cdkDragData]="r.index">
            <span class="grip" cdkDragHandle aria-hidden="true" title="Glisser pour changer l'ordre de pose">⋮⋮</span>
            <button type="button" [class.on]="r.zone.id === store.selectedId()" [attr.aria-pressed]="r.zone.id === store.selectedId()" (click)="store.select(r.zone.id)">
              <span class="n">{{ r.index + 1 }}</span>
              <i class="dot" [class.hole]="r.zone.hole" [style.--c]="palette[r.zone.color].hex"></i>
              <span class="nm">{{ r.zone.name }}</span>
              @if (r.narrow) {
                <span class="tag">étroite</span>
              }
              <span class="a">{{ r.zone.hole ? 'trou' : round(r.zone.angle) + '°' }}</span>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="note">Aucune forme : seul le fond est visible.</p>
    }
    <p class="note">Le haut de la liste passe devant. Les numéros sont ceux du plan de pose.</p>
  `,
  styles: `
    .layers { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    li { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: var(--bg); }
    li:last-child { border-bottom: 0; }
    .grip { display: grid; place-items: center; width: 28px; color: var(--mute); cursor: grab; letter-spacing: -3px; user-select: none; touch-action: none; }
    button { flex: 1; border: 0; border-radius: 0; justify-content: flex-start; gap: 10px; background: transparent; }
    button.on { background: var(--soft); box-shadow: inset 3px 0 var(--acc); }
    .n { color: var(--mute); width: 2.2em; text-align: right; font-variant-numeric: tabular-nums; }
    .nm { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .a { color: var(--mute); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .cdk-drag-preview { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25); border-radius: 8px; }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drop-list-dragging li:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }
  `,
})
export class LayersPanelComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly palette = PALETTE;
  protected readonly round = Math.round;

  /** Ordre inversé : le dernier posé (au-dessus) en haut de la liste. */
  protected readonly rows = computed(() => {
    const p = this.store.project();
    return p.zones.map((zone, index) => ({ zone, index, narrow: isNarrow(zone, p.sw) })).reverse();
  });

  protected drop(e: CdkDragDrop<unknown, unknown, number>): void {
    const n = this.rows().length;
    this.store.reorder(n - 1 - e.previousIndex, n - 1 - e.currentIndex);
  }
}
