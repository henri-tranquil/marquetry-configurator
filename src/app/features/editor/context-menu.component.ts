import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core';
import { defaultFill, FILL_LABELS, FILL_TYPES, FillType } from '../../core/model/project';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

interface Item {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  on?: boolean;
  run: () => void;
}

/** Menu du clic droit sur une forme. Flèches, Entrée, Échap. */
@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'key($event)', '(document:pointerdown)': 'outside($event)' },
  template: `
    @if (ui.menu(); as m) {
      @if (store.selected(); as z) {
        <div class="menu" role="menu" [attr.aria-label]="'Actions sur ' + z.name" [style.left.px]="m.x" [style.top.px]="m.y">
          <div class="title">{{ z.name }}</div>
          @for (it of items(); track it.id) {
            @if (it.id.startsWith('sep')) {
              <div class="sep" role="separator"></div>
            } @else {
              <button type="button" role="menuitem" [class.danger]="it.danger" [class.on]="it.on" (click)="pick(it)">
                <span>{{ it.label }}</span>
                @if (it.hint) {
                  <kbd>{{ it.hint }}</kbd>
                }
              </button>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    .menu {
      position: absolute; z-index: 5; min-width: 220px; padding: 6px; border-radius: 10px;
      background: var(--bg); color: var(--ink); border: 1px solid var(--line);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); display: grid; gap: 2px;
    }
    .title { padding: 4px 10px 6px; font-size: 13px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
    button { border: 0; background: transparent; justify-content: space-between; width: 100%; min-height: 40px; font-size: 14px; }
    button:hover, button:focus-visible { background: var(--soft); outline: none; }
    button.on { font-weight: 600; background: transparent; color: var(--ink); }
    button.on span::after { content: ' ✓'; color: var(--acc); }
    .danger { color: var(--acc); }
    kbd { font: 12px ui-monospace, monospace; color: var(--mute); }
    .sep { height: 1px; background: var(--line); margin: 4px 0; }
  `,
})
export class ContextMenuComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly ui = inject(UiStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly items = computed<Item[]>(() => {
    const z = this.store.selected();
    if (!z) return [];
    const s = this.store;
    const fills: Item[] = z.hole
      ? []
      : [
          { id: 'sep1', label: '', run: () => undefined },
          ...FILL_TYPES.map((t: FillType) => ({
            id: `fill-${t}`,
            label: `Brins : ${FILL_LABELS[t].toLowerCase()}`,
            on: (z.fill?.type ?? 'parallele') === t,
            run: () => s.apply((p) => ({ ...p, zones: p.zones.map((q) => (q.id === z.id ? { ...q, fill: defaultFill(t, q.fill) } : q)) })),
          })),
        ];
    return [
      { id: 'dup', label: 'Dupliquer', hint: 'Ctrl+D', run: () => s.duplicateSelected() },
      { id: 'front', label: 'Passer devant', run: () => s.moveSelected(1) },
      { id: 'back', label: 'Passer derrière', run: () => s.moveSelected(-1) },
      ...fills,
      { id: 'sep2', label: '', run: () => undefined },
      {
        id: 'hole',
        label: z.hole ? 'Remplir (ce n’est plus un trou)' : 'Transformer en trou',
        run: () =>
          s.apply((p) => ({
            ...p,
            zones: p.zones.map((q) => (q.id === z.id ? { ...q, hole: !q.hole, edge: q.edge ?? { type: 'droit', size: 5 } } : q)),
          })),
      },
      { id: 'del', label: 'Supprimer', hint: 'Suppr', danger: true, run: () => s.deleteSelected() },
    ];
  });

  constructor() {
    // à l'ouverture : focus sur la première action, menu gardé dans la zone visible
    afterRenderEffect(() => {
      if (!this.ui.menu()) return;
      const menu = this.host.nativeElement.querySelector<HTMLElement>('.menu');
      const fig = this.host.nativeElement.parentElement;
      if (!menu || !fig) return;
      const maxX = fig.clientWidth - menu.offsetWidth - 8;
      const maxY = fig.clientHeight - menu.offsetHeight - 8;
      if (menu.offsetLeft > maxX) menu.style.left = `${Math.max(8, maxX)}px`;
      if (menu.offsetTop > maxY) menu.style.top = `${Math.max(8, maxY)}px`;
      if (!menu.contains(document.activeElement)) menu.querySelector<HTMLElement>('button')?.focus();
    });
  }

  protected pick(it: Item): void {
    this.ui.menu.set(null);
    it.run();
  }

  protected key(e: KeyboardEvent): void {
    const buttons = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]')];
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.ui.menu.set(null);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = buttons.length;
      buttons[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus();
    }
  }

  protected outside(e: PointerEvent): void {
    if (this.ui.menu() && !this.host.nativeElement.contains(e.target as Node)) this.ui.menu.set(null);
  }
}
