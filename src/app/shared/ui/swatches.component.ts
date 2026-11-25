import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PALETTE, STRAW_COLORS, StrawColor } from '../../core/model/project';

@Component({
  selector: 'app-swatches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    @for (c of colors; track c) {
      <button
        type="button"
        class="sw"
        [class.on]="c === value()"
        [style.--c]="palette[c].hex"
        [title]="palette[c].label"
        [attr.aria-label]="palette[c].label"
        [attr.aria-pressed]="c === value()"
        (click)="picked.emit(c)"
      ></button>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: 6px; }
    .sw {
      width: 44px; height: 44px; padding: 0; border-radius: 50%;
      background: var(--c); border: 3px solid var(--bg); box-shadow: 0 0 0 1px light-dark(var(--edge), #6a7078);
    }
    .sw.on { box-shadow: 0 0 0 2px var(--acc); }
  `,
})
export class SwatchesComponent {
  readonly value = input.required<StrawColor>();
  readonly label = input('Couleur de paille');
  readonly picked = output<StrawColor>();
  protected readonly colors = STRAW_COLORS;
  protected readonly palette = PALETTE;
}
