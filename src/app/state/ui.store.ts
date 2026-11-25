import { Injectable, signal } from '@angular/core';

export type ZoomRequest = 'in' | 'out' | 'fit';

export interface ContextMenuState {
  /** Position en px dans la zone de travail. */
  x: number;
  y: number;
}

/**
 * État d'interface qui n'appartient pas au projet (pas d'historique, pas de sauvegarde) :
 * pose guidée, comparaison d'éclairages, menu contextuel, aide, fichier SVG à importer.
 */
@Injectable({ providedIn: 'root' })
export class UiStore {
  /** Étape de la pose guidée (index dans la liste des étapes), null = inactive. */
  readonly guideStep = signal<number | null>(null);
  /** Comparer deux éclairages côte à côte. */
  readonly compare = signal(false);
  /** Azimut de la seconde lumière (comparaison). */
  readonly lightB = signal(125);
  readonly menu = signal<ContextMenuState | null>(null);
  readonly helpOpen = signal(false);
  /** Panneau de réglages déplié (mobile). */
  readonly sheetOpen = signal(false);
  /** Demande de zoom (horodatée pour être rejouable). */
  readonly zoomRequest = signal<{ kind: ZoomRequest; at: number } | null>(null);
  /** Fichier SVG choisi ou déposé, en attente de la boîte d'import. */
  readonly svgFile = signal<File | null>(null);
  readonly projectsOpen = signal(false);
  /** Zoom courant du canvas 2D (1 = ajusté), affiché dans la barre d'outils. */
  readonly zoomLevel = signal(1);

  zoom(kind: ZoomRequest): void {
    this.zoomRequest.set({ kind, at: performance.now() });
  }
}
