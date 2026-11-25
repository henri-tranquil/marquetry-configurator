import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProjectThumbComponent } from '../../shared/ui/project-thumb.component';
import { SuggestionsStore } from '../../state/suggestions.store';

/** Bande de suggestions sous le panneau : aperçu au clic, application seulement sur demande. */
@Component({
  selector: 'app-suggestions-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectThumbComponent],
  template: `
    @if (sg.visible()) {
      <section class="bar" aria-labelledby="sg-title">
        <div class="head">
          <h2 id="sg-title">Suggestions</h2>
          @if (sg.current(); as s) {
            <p class="hint" role="status">Aperçu : <b>{{ s.label }}</b>. {{ s.hint }} Rien n'est appliqué pour l'instant.</p>
          } @else {
            <p class="hint">Clique une idée pour la voir sur ton panneau. Rien n'est appliqué tant que tu ne le décides pas.</p>
          }
          <button type="button" class="x" aria-label="Masquer les suggestions" title="Masquer les suggestions" (click)="sg.close()">✕</button>
        </div>
        <ul>
          @for (s of sg.list(); track s.id) {
            <li>
              <button type="button" class="card" [class.on]="sg.previewId() === s.id" [attr.aria-pressed]="sg.previewId() === s.id" [title]="s.hint" (click)="sg.show(s.id)">
                <app-project-thumb [project]="s.result" [size]="72" />
                <span>{{ s.label }}</span>
              </button>
            </li>
          }
        </ul>
        @if (sg.current()) {
          <div class="actions">
            <button type="button" (click)="sg.cancel()">Ne pas appliquer</button>
            <button type="button" class="primary" (click)="sg.apply()">Appliquer</button>
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .bar {
      margin: 0 12px 6px;
      background: var(--bg); color: var(--ink); border-radius: 12px; padding: 10px 12px 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .head { display: flex; align-items: center; gap: 12px; }
    h2 { margin: 0; font-size: 15px; white-space: nowrap; }
    .hint { margin: 0; flex: 1; color: var(--mute); font-size: 13px; }
    .hint b { color: var(--ink); }
    .x { border: 0; min-width: 44px; justify-content: center; background: transparent; }
    ul { list-style: none; margin: 6px 0 0; padding: 0 0 4px; display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x proximity; }
    li { flex: none; scroll-snap-align: start; }
    .card {
      width: 104px; height: auto; flex-direction: column; gap: 4px; padding: 6px; justify-content: flex-start;
      background: var(--soft); font-size: 13px; line-height: 1.2; color: var(--ink);
    }
    .card app-project-thumb { width: 100%; height: 72px; }
    .card.on { border-color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); background: var(--bg); color: var(--ink); font-weight: 600; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    @media (max-width: 600px) {
      .bar { padding: 6px 8px 8px; margin: 0 8px 6px; }
      .hint { display: none; }
      .head { justify-content: space-between; }
      .card { width: 78px; font-size: 12px; }
      .card app-project-thumb { height: 46px; }
      .actions { margin-top: 4px; }
      .actions button { flex: 1; justify-content: center; }
    }
  `,
})
export class SuggestionsBarComponent {
  protected readonly sg = inject(SuggestionsStore);
}
