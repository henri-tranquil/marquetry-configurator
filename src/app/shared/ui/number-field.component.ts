import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Champ numérique avec unité. Émet `live` à la frappe (valeurs finies seulement)
 * et `committed` sur `change`. N'écrase pas la saisie en cours tant que le champ a le focus.
 */
@Component({
  selector: 'app-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      <span class="lbl">{{ label() }}</span>
      <span class="box">
      <input
        #f
        type="number"
        inputmode="decimal"
        [min]="min()"
        [max]="max()"
        [step]="step()"
        [value]="f === focused ? f.value : value()"
        (focus)="focused = f"
        (blur)="focused = null"
        (input)="onInput(f.value)"
        (change)="committed.emit(+f.value)"
      />
      <span class="unit" aria-hidden="true">{{ unit() }}</span>
      </span>
      <span class="visually-hidden">en {{ unit() === '°' ? 'degrés' : unit() }}</span>
    </label>
  `,
  styles: `
    :host { display: block; }
    label { display: grid; gap: 3px; color: var(--mute); font-size: 13px; }
    .box { position: relative; display: block; }
    input { width: 100%; padding-right: 2.4em; }
    .unit { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--mute); font-size: 14px; }
  `,
})
export class NumberFieldComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly unit = input('mm');
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input(1);
  readonly live = output<number>();
  readonly committed = output<number>();
  protected focused: HTMLInputElement | null = null;

  protected onInput(raw: string): void {
    const v = raw.trim() === '' ? NaN : Number(raw);
    if (Number.isFinite(v)) this.live.emit(v);
  }
}
