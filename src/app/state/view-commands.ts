import { Injectable, signal } from '@angular/core';

/** Commandes ponctuelles vers la vue 3D, sans que l'éditeur dépende de three.js. */
@Injectable({ providedIn: 'root' })
export class ViewCommands {
  /** Incrémenté à chaque demande de « vue de face ». */
  readonly frontView = signal(0);

  requestFrontView(): void {
    this.frontView.update((n) => n + 1);
  }
}
