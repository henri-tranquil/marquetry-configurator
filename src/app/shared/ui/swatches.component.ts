import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CustomColor, isCustomColor, STRAW_COLORS, StrawColor, strawInfo } from '../../core/model/project';

/**
 * Pailles prédéfinies, teintes déjà utilisées dans le projet, et une pastille « + » qui ouvre
 * le sélecteur de couleur du système pour une teinte sur mesure.
 */
@Component({
  selector: 'app-swatches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    @for (c of all(); track c) {
      <button
        type="button"
        class="sw"
        [class.custom]="isCustom(c)"
        [class.on]="c === value()"
        [style.--c]="info(c).hex"
        [title]="info(c).label"
        [attr.aria-label]="info(c).label"
        [attr.aria-pressed]="c === value()"
        (click)="picked.emit(c)"
      ></button>
    }
    <label class="sw pick" [title]="'Choisir une autre couleur'">
      <span aria-hidden="true">+</span>
      <input
        #ci
        type="color"
        [attr.aria-label]="label() + ' : autre couleur'"
        [value]="info(value()).hex"
        (change)="pick(ci.value)"
      />
    </label>
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: 6px; }
    .sw {
      width: 44px; height: 44px; padding: 0; border-radius: 50%;
      background: var(--c); border: 3px solid var(--bg); box-shadow: 0 0 0 1px light-dark(var(--edge), #6a7078);
    }
    .sw.custom { border-radius: 30%; }
    .sw.on { box-shadow: 0 0 0 2px var(--acc); }
    .pick {
      position: relative; display: grid; place-items: center; cursor: pointer; color: var(--ink); font-size: 22px; line-height: 1;
      background: conic-gradient(from 0deg, #d6b25c, #9c3027, #c4867f, #2f4a7a, #6e8a56, #ead592, #d6b25c);
    }
    .pick span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--bg); }
    .pick:focus-within { outline: 2px solid var(--acc); outline-offset: 2px; }
    .pick input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
  `,
})
export class SwatchesComponent {
  readonly value = input.required<StrawColor>();
  readonly label = input('Couleur de paille');
  /** Teintes sur mesure déjà présentes dans le projet, proposées à côté des pailles. */
  readonly recent = input<readonly CustomColor[]>([]);
  readonly picked = output<StrawColor>();
  protected readonly info = strawInfo;
  protected readonly isCustom = isCustomColor;

  protected readonly all = computed<StrawColor[]>(() => {
    const v = this.value();
    const extra = [...this.recent()];
    if (isCustomColor(v) && !extra.includes(v)) extra.push(v);
    return [...STRAW_COLORS, ...extra.slice(-8)];
  });

  protected pick(v: string): void {
    const hex = v.toLowerCase();
    if (isCustomColor(hex)) this.picked.emit(hex);
  }
}
