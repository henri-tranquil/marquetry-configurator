import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let uid = 0;

/** Curseur avec libellé et valeur affichée. `live` pendant le geste, `committed` à la fin. */
@Component({
  selector: 'app-slider-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lab">
      <label [for]="id">{{ label() }}</label>
      <output [for]="id">{{ display() }}</output>
    </div>
    <input
      #r
      type="range"
      [id]="id"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [value]="value()"
      [style.--pct.%]="pct()"
      [attr.aria-valuetext]="display()"
      (input)="live.emit(+r.value)"
      (change)="committed.emit()"
    />
  `,
  styles: `:host { display: block; }`,
})
export class SliderFieldComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly display = input.required<string>();
  readonly min = input(0);
  readonly max = input(1);
  readonly step = input(0.05);
  readonly live = output<number>();
  readonly committed = output();
  protected readonly id = `sl-${++uid}`;
  protected readonly pct = computed(() => {
    const span = this.max() - this.min();
    return span > 0 ? ((this.value() - this.min()) / span) * 100 : 0;
  });
}
