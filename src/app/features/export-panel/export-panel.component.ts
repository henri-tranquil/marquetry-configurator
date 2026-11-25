import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { tiledPlanHtml, tileLayout } from '../../core/export/plan-tiles';
import { svgPlan } from '../../core/export/svg-plan';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

type DialogMode = 'copy' | 'import';

@Component({
  selector: 'app-export-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid">
      <button type="button" class="primary wide" (click)="printTiles()">Imprimer le gabarit · {{ pages() }}</button>
      <button type="button" (click)="download()">Télécharger le SVG</button>
      <button type="button" (click)="copy('svg')">{{ flashed() === 'svg' ? 'Copié' : 'Copier le SVG' }}</button>
      <button type="button" (click)="copy('json')">{{ flashed() === 'json' ? 'Copié' : 'Copier le projet' }}</button>
      <button type="button" (click)="openImport()">Coller un projet</button>
      <button type="button" (click)="svgInput.click()">Importer un dessin SVG</button>
      <button type="button" class="warn" (click)="store.clearZones()">Tout effacer</button>
    </div>
    <input #svgInput type="file" accept=".svg,image/svg+xml" hidden (change)="pickSvg(svgInput)" />
    <p class="note">
      Le gabarit s'imprime à l'échelle 1:1 sur des feuilles A4 qui se recouvrent, avec des croix de calage. Le SVG est en
      millimètres pour un traceur ou un grand format.
    </p>
    @if (popupBlocked()) {
      <p class="note" role="alert">Le navigateur a bloqué la nouvelle fenêtre : autorise les fenêtres pour ce site, ou télécharge le SVG.</p>
    }

    <dialog #dlg aria-labelledby="dlg-title" (close)="mode.set(null)">
      <!-- clic sur le fond : fermeture (Échap reste le chemin clavier natif du <dialog>) -->
      <h2 id="dlg-title">{{ title() }}</h2>
      <p class="note" role="status">{{ message() }}</p>
      <textarea #tx spellcheck="false" aria-labelledby="dlg-title" [value]="text()"></textarea>
      <div class="row">
        <button type="button" class="on" (click)="confirm(tx)">{{ mode() === 'import' ? 'Importer' : 'Sélectionner tout' }}</button>
        <button type="button" (click)="dlg.close()">Fermer</button>
      </div>
    </dialog>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .grid button { justify-content: center; }
    .wide { grid-column: 1 / -1; }
    dialog { border: 0; border-radius: 12px; padding: 18px; width: min(560px, calc(100% - 32px)); background: var(--bg); color: var(--ink); }
    dialog[open] { display: grid; gap: 12px; }
    dialog::backdrop { background: rgba(10, 14, 12, 0.55); }
    h2, .note { margin: 0; }
  `,
})
export class ExportPanelComponent {
  protected readonly store = inject(ProjectStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly mode = signal<DialogMode | null>(null);
  protected readonly title = signal('');
  protected readonly message = signal('');
  protected readonly text = signal('');
  protected readonly flashed = signal<'svg' | 'json' | null>(null);
  protected readonly popupBlocked = signal(false);
  private readonly ui = inject(UiStore);
  protected readonly pages = computed(() => {
    const L = tileLayout(this.store.committed().panel);
    const n = L.tiles.length;
    return `${n} page${n > 1 ? 's' : ''} A4`;
  });

  protected printTiles(): void {
    const html = tiledPlanHtml(this.store.committed());
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    this.popupBlocked.set(!w);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  protected pickSvg(input: HTMLInputElement): void {
    const f = input.files?.[0];
    if (f) this.ui.svgFile.set(f);
    input.value = '';
  }
  private flashTimer = 0;

  protected async copy(kind: 'svg' | 'json'): Promise<void> {
    const text = kind === 'svg' ? svgPlan(this.store.committed()) : this.store.exportJson();
    try {
      await navigator.clipboard.writeText(text);
      this.flashed.set(kind);
      clearTimeout(this.flashTimer);
      this.flashTimer = window.setTimeout(() => this.flashed.set(null), 1400);
    } catch {
      this.open('copy', kind === 'svg' ? 'Plan SVG' : 'Projet', 'Copie automatique refusée : sélectionne le texte et copie-le à la main.', text);
    }
  }

  protected download(): void {
    const p = this.store.committed();
    const blob = new Blob([svgPlan(p)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-de-pose-${p.panel.w}x${p.panel.h}mm.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected openImport(): void {
    this.open('import', 'Importer un projet', 'Colle ici le texte copié avec « Copier le projet ».', '');
  }

  protected confirm(tx: HTMLTextAreaElement): void {
    if (this.mode() === 'import') {
      if (this.store.importJson(tx.value)) this.dialog().nativeElement.close();
      else this.message.set("Ce texte n'est pas un projet Atelier paille valide.");
    } else {
      tx.focus();
      tx.select();
    }
  }

  private open(mode: DialogMode, title: string, message: string, text: string): void {
    this.mode.set(mode);
    this.title.set(title);
    this.message.set(message);
    this.text.set(text);
    const d = this.dialog().nativeElement;
    d.showModal();
    d.onclick = (e) => {
      if (e.target === d) d.close();
    };
    const tx = d.querySelector('textarea');
    if (tx) {
      tx.value = text;
      tx.focus();
      if (mode === 'copy') tx.select();
    }
  }
}
