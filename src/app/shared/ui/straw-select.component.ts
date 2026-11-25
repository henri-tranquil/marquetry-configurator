import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isCustomColor, STRAW_COLORS, StrawColor, strawInfo } from '../../core/model/project';

/** Choix compact d'une paille : liste des pailles prédéfinies, plus un bouton de teinte libre. */
@Component({
  selector: 'app-straw-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="dot" aria-hidden="true" [style.--c]="info(value()).hex"></span>
    <select #s [attr.aria-label]="label()" (change)="choose(s.value)">
      @for (c of options(); track c) {
        <option [value]="c" [selected]="c === value()">{{ info(c).label }}</option>
      }
    </select>
    <label class="pick" [title]="'Autre teinte'">
      <span aria-hidden="true">+</span>
      <input #ci type="color" [attr.aria-label]="label() + ' : autre teinte'" [value]="info(value()).hex" (change)="choose(ci.value)" />
    </label>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .dot { width: 20px; height: 20px; border-radius: 50%; background: var(--c); flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25); }
    select { flex: 1; min-width: 0; }
    .pick {
      position: relative; flex: none; width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; cursor: pointer;
      background: conic-gradient(from 0deg, #d6b25c, #9c3027, #c4867f, #2f4a7a, #6e8a56, #ead592, #d6b25c);
    }
    .pick span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--bg); color: var(--ink); font-size: 18px; line-height: 1; }
    .pick:focus-within { outline: 2px solid var(--acc); outline-offset: 2px; }
    .pick input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
  `,
})
export class StrawSelectComponent {
  readonly value = input.required<StrawColor>();
  readonly label = input('Paille');
  readonly picked = output<StrawColor>();
  protected readonly info = strawInfo;
  protected readonly options = computed<StrawColor[]>(() => {
    const v = this.value();
    return isCustomColor(v) ? [...STRAW_COLORS, v] : [...STRAW_COLORS];
  });

  protected choose(v: string): void {
    const c = v.toLowerCase();
    if ((STRAW_COLORS as readonly string[]).includes(c)) this.picked.emit(c as StrawColor);
    else if (isCustomColor(c)) this.picked.emit(c);
  }
}
