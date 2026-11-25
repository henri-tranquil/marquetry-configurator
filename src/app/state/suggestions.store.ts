import { computed, inject, Injectable, signal } from '@angular/core';
import { prepare } from '../core/geometry/geometry';
import { Project } from '../core/model/project';
import { suggestionsFor } from '../core/patterns/suggestions';
import { ProjectStore } from './project.store';

/**
 * Suggestions proposées sous le panneau. Un clic les montre en aperçu sur le tapis sans rien modifier ;
 * seul « Appliquer » les inscrit dans le projet (et dans l'historique).
 */
@Injectable({ providedIn: 'root' })
export class SuggestionsStore {
  private readonly store = inject(ProjectStore);
  /** Barre fermée par l'utilisateur, pour ces dimensions de panneau : un nouveau gabarit la rouvre. */
  private readonly dismissedFor = signal<string | null>(null);
  private readonly panelKey = computed(() => {
    const { w, h } = this.store.committed().panel;
    return `${w}x${h}`;
  });
  /** Barre rouverte à la main alors que le panneau a déjà des formes. */
  private readonly forced = signal(false);
  readonly previewId = signal<string | null>(null);

  readonly list = computed(() => suggestionsFor(this.store.committed()));
  readonly visible = computed(
    () => this.forced() || this.previewId() !== null || (this.dismissedFor() !== this.panelKey() && !this.store.committed().zones.some((z) => !z.hole)),
  );
  readonly current = computed(() => this.list().find((s) => s.id === this.previewId()) ?? null);

  /** Projet à dessiner à la place du vrai pendant un aperçu (réglages de vue et lumière en direct). */
  readonly preview = computed<Project | null>(() => {
    const s = this.current();
    if (!s) return null;
    const live = this.store.project();
    return { ...live, bg: s.result.bg, zones: s.result.zones };
  });
  readonly previewPrepared = computed(() => {
    const p = this.preview();
    return p ? prepare(p.zones) : null;
  });

  toggle(): void {
    if (this.visible()) this.close();
    else this.forced.set(true);
  }

  close(): void {
    this.previewId.set(null);
    this.forced.set(false);
    this.dismissedFor.set(this.panelKey());
  }

  show(id: string): void {
    this.previewId.set(this.previewId() === id ? null : id);
  }

  apply(): void {
    const s = this.current();
    if (!s) return;
    this.store.apply((p) => ({ ...p, bg: s.result.bg, zones: s.result.zones }));
    this.store.select(null);
    this.close();
  }

  /** Abandon de l'aperçu : le projet n'a jamais changé. */
  cancel(): void {
    this.previewId.set(null);
  }
}
