import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SegOption<T> {
  value: T;
  label: string;
}

@Component({
  selector: 'app-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-label]': 'label()', class: 'seg' },
  template: `
    @for (o of options(); track o.value) {
      <button
        type="button"
        [class.on]="o.value === value()"
        [attr.aria-pressed]="o.value === value()"
        (click)="picked.emit(o.value)"
      >
        {{ o.label }}
      </button>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    button { border-radius: 0; padding: 0 10px; }
    button:first-child { border-radius: 8px 0 0 8px; }
    button + button { margin-left: -1px; }
    button:last-child { border-radius: 0 8px 8px 0; }
  `,
})
export class SegmentedComponent<T extends string> {
  readonly options = input.required<readonly SegOption<T>[]>();
  readonly value = input.required<T>();
  readonly label = input.required<string>();
  readonly picked = output<T>();
}
