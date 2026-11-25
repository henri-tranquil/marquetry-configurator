import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { UiStore } from '../../state/ui.store';

interface Shortcut {
  keys: string[];
  what: string;
}

/** Aide : gestes et raccourcis clavier (touche « ? »). */
@Component({
  selector: 'app-help-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg aria-labelledby="help-title" (close)="ui.helpOpen.set(false)">
      <div class="head">
        <h2 id="help-title">Gestes et raccourcis</h2>
        <button type="button" class="x" aria-label="Fermer" (click)="dlg.close()">✕</button>
      </div>
      <div class="cols">
        @for (g of groups; track g.title) {
          <section>
            <h3>{{ g.title }}</h3>
            <dl>
              @for (s of g.items; track s.what) {
                <div>
                  <dt>
                    @for (k of s.keys; track k; let last = $last) {
                      <kbd>{{ k }}</kbd>@if (!last) {<span class="or"> ou </span>}
                    }
                  </dt>
                  <dd>{{ s.what }}</dd>
                </div>
              }
            </dl>
          </section>
        }
      </div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; border-radius: 14px; padding: 18px 20px; width: min(760px, calc(100% - 32px)); background: var(--bg); color: var(--ink); }
    dialog::backdrop { background: rgba(10, 14, 12, 0.55); }
    .head { display: flex; justify-content: space-between; align-items: center; }
    h2 { margin: 0; }
    .x { border: 0; min-width: 44px; justify-content: center; background: transparent; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px 28px; }
    h3 { font-size: 14px; color: var(--mute); margin: 14px 0 6px; font-weight: 600; }
    dl { margin: 0; display: grid; gap: 6px; }
    dl div { display: grid; grid-template-columns: minmax(0, 11em) 1fr; gap: 10px; align-items: baseline; }
    dt { line-height: 1.9; }
    dd { margin: 0; }
    kbd { font: 12px/1 ui-monospace, monospace; padding: 4px 6px; border: 1px solid var(--edge); border-bottom-width: 2px; border-radius: 5px; background: var(--soft); }
    .or { color: var(--mute); font-size: 12px; }
  `,
})
export class HelpDialogComponent {
  protected readonly ui = inject(UiStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly groups: { title: string; items: Shortcut[] }[] = [
    {
      title: 'Sur le panneau',
      items: [
        { keys: ['Glisser'], what: 'déplacer une forme (aimantée aux bords et milieux)' },
        { keys: ['Alt'], what: 'pendant un geste : sans aimantation' },
        { keys: ['Coin'], what: 'taille en gardant les proportions (Maj : libre)' },
        { keys: ['Milieu d’un côté'], what: 'largeur ou hauteur seule' },
        { keys: ['Rond du haut'], what: 'rotation par pas de 5° (Maj : libre)' },
        { keys: ['Clic droit'], what: 'actions sur la forme' },
        { keys: ['Glisser le tapis'], what: 'déplacer la vue' },
        { keys: ['Molette', 'Pincement'], what: 'zoomer' },
        { keys: ['Double-clic sur le tapis'], what: 'revenir à la vue ajustée' },
      ],
    },
    {
      title: 'Clavier',
      items: [
        { keys: ['Ctrl+Z'], what: 'annuler' },
        { keys: ['Ctrl+Maj+Z', 'Ctrl+Y'], what: 'rétablir' },
        { keys: ['Ctrl+D'], what: 'dupliquer la forme' },
        { keys: ['Suppr'], what: 'supprimer la forme' },
        { keys: ['Flèches'], what: 'déplacer de 1 mm (Maj : 10 mm)' },
        { keys: ['+', '−'], what: 'zoomer, dézoomer' },
        { keys: ['0'], what: 'vue ajustée' },
        { keys: ['Échap'], what: 'désélectionner, fermer' },
        { keys: ['?'], what: 'cette aide' },
      ],
    },
  ];

  constructor() {
    effect(() => {
      const d = this.dialog().nativeElement;
      if (this.ui.helpOpen() && !d.open) d.showModal();
      if (!this.ui.helpOpen() && d.open) d.close();
    });
  }
}
