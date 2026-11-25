import { ChangeDetectionStrategy, Component, input, OnInit, signal } from '@angular/core';

const STORE_KEY = 'atelier-paille-ui-sections';

function readOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? (o as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Section repliable du panneau latéral. Fermée, elle garde un résumé (valeurs clés).
 * L'état ouvert/fermé est une préférence locale du navigateur (pas dans le projet).
 */
@Component({
  selector: 'app-panel-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details [open]="open()" (toggle)="onToggle(d.open)" #d>
      <summary>
        <h2>{{ title() }}</h2>
        @if (!open() && summary()) {
          <span class="sum">{{ summary() }}</span>
        }
        <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </summary>
      <div class="body"><ng-content /></div>
    </details>
  `,
  styles: `
    :host { display: block; border-bottom: 1px solid var(--line); }
    summary {
      display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 16px;
      cursor: pointer; list-style: none; user-select: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary:hover h2 { color: var(--acc); }
    summary:focus-visible { outline-offset: -2px; }
    h2 { margin: 0; flex: none; }
    .sum { flex: 1; min-width: 0; color: var(--mute); font-size: 14px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
    .chev { width: 16px; height: 16px; margin-left: auto; flex: none; fill: none; stroke: var(--mute); stroke-width: 1.8; transition: transform 0.15s ease; }
    .sum + .chev { margin-left: 0; }
    details:not([open]) .chev { transform: rotate(-90deg); }
    .body { padding: 0 16px 18px; }
    @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
  `,
})
export class PanelSectionComponent implements OnInit {
  readonly title = input.required<string>();
  /** Identifiant stable pour mémoriser l'état. */
  readonly key = input.required<string>();
  readonly summary = input('');
  readonly defaultOpen = input(true);
  protected readonly open = signal(true);

  ngOnInit(): void {
    const saved = readOpen()[this.key()];
    this.open.set(saved ?? this.defaultOpen());
  }

  protected onToggle(isOpen: boolean): void {
    if (isOpen === this.open()) return;
    this.open.set(isOpen);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...readOpen(), [this.key()]: isOpen }));
    } catch {
      /* stockage indisponible : l'état reste valable pour la session */
    }
  }
}
