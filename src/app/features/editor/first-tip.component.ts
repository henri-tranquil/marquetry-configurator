import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { UiStore } from '../../state/ui.store';

const KEY = 'atelier-paille-tip-vu';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Conseil discret à la première visite, qui ne revient plus une fois fermé. */
@Component({
  selector: 'app-first-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside class="tip" aria-label="Premiers pas">
        <p>
          <strong>Premiers pas :</strong> choisis un gabarit (sous-bock, porte…), puis ajoute tes formes ou essaie une
          suggestion : rien n'est appliqué tant que tu ne l'as pas décidé. Fais tourner le petit soleil pour voir les reflets.
        </p>
        <div class="row">
          <button type="button" (click)="help()">Tous les raccourcis</button>
          <button type="button" class="primary" (click)="close()">Compris</button>
        </div>
      </aside>
    }
  `,
  styles: `
    .tip {
      position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 3;
      width: min(520px, calc(100% - 24px)); padding: 12px 14px; border-radius: 12px;
      background: var(--bg); color: var(--ink); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    p { margin: 0 0 10px; font-size: 14px; }
    .row { justify-content: flex-end; }
  `,
})
export class FirstTipComponent {
  private readonly ui = inject(UiStore);
  protected readonly visible = signal(!seen());

  protected close(): void {
    this.visible.set(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* rien : le conseil reviendra à la prochaine visite */
    }
  }

  protected help(): void {
    this.close();
    this.ui.helpOpen.set(true);
  }
}
