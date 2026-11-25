import { computed, effect, Injectable, signal } from '@angular/core';
import { prepare } from '../core/geometry/geometry';
import { estimateMaterials, visibleAreas, ZoneUsage } from '../core/materials/bom';
import { blankProject, looksLikeProject, normalizeProject } from '../core/model/normalize';
import {
  AddKind,
  duplicateZone,
  moveZone,
  newShape,
  nextId,
  reorderZone,
  resizePanel,
} from '../core/model/operations';
import { CustomColor, isCustomColor, Project, STORAGE_KEY, Zone } from '../core/model/project';
import { generatePattern, insertPattern, PatternOptions } from '../core/patterns/patterns';

const HISTORY_MAX = 100;

export interface LayingStep {
  zone: Zone;
  /** Numéro sur le plan de pose. */
  number: number;
  usage: ZoneUsage;
}

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o: unknown = JSON.parse(raw);
      if (looksLikeProject(o)) return normalizeProject(o);
    }
  } catch {
    /* stockage indisponible ou JSON abîmé : on repart d'un panneau vide */
  }
  return blankProject();
}

/**
 * État du projet. Les mutations « live » (slider, glisser) ne touchent pas l'historique ;
 * commit() à la fin du geste pousse l'état précédent dans la pile d'annulation.
 */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly _project = signal<Project>(loadInitial());
  private readonly _committed = signal<Project>(this._project());
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private readonly _history = signal({ undo: 0, redo: 0 });

  readonly project = this._project.asReadonly();
  /** Dernier état commité (persisté). */
  readonly committed = this._committed.asReadonly();
  readonly selectedId = signal<number | null>(null);

  readonly selected = computed<Zone | null>(() => {
    const id = this.selectedId();
    return id === null ? null : (this._project().zones.find((z) => z.id === id) ?? null);
  });
  readonly prepared = computed(() => prepare(this._project().zones));
  /** Calcul coûteux : suit l'état commité, pas chaque mouvement de souris. */
  readonly bom = computed(() => estimateMaterials(this._committed()));
  /** Étapes de la pose guidée : zones visibles dans l'ordre de pose, avec leur surface. */
  readonly layingSteps = computed<LayingStep[]>(() => {
    const p = this._committed();
    const areas = visibleAreas(p);
    return p.zones
      .map((zone, i) => ({ zone, number: i + 1, usage: areas.get(zone.id) }))
      .filter((s): s is LayingStep => !s.zone.hole && !!s.usage && s.usage.area > 0);
  });
  /** Teintes sur mesure utilisées dans le projet (zones et fond), pour les reproposer. */
  readonly customColors = computed<CustomColor[]>(() => {
    const p = this._committed();
    const set = new Set<CustomColor>();
    for (const c of [p.bg.color, ...p.zones.map((z) => z.color)]) if (isCustomColor(c)) set.add(c);
    return [...set];
  });
  readonly canUndo = computed(() => this._history().undo > 0);
  readonly canRedo = computed(() => this._history().redo > 0);

  constructor() {
    effect(() => {
      const p = this._committed();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      } catch {
        /* quota dépassé ou stockage bloqué : le projet reste en mémoire */
      }
    });
  }

  /* ---------- mutations live ---------- */

  update(fn: (p: Project) => Project): void {
    this._project.update(fn);
  }

  patch(partial: Partial<Project>): void {
    this._project.update((p) => ({ ...p, ...partial }));
  }

  updateZone(id: number, fn: (z: Zone) => Zone): void {
    this._project.update((p) => ({ ...p, zones: p.zones.map((z) => (z.id === id ? fn(z) : z)) }));
  }

  patchZone(id: number, partial: Partial<Zone>): void {
    this.updateZone(id, (z) => ({ ...z, ...partial }));
  }

  /* ---------- historique ---------- */

  commit(): void {
    const cur = this._project();
    const prev = this._committed();
    if (cur === prev || JSON.stringify(cur) === JSON.stringify(prev)) return;
    this.undoStack.push(prev);
    if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
    this.redoStack = [];
    this._committed.set(cur);
    this.syncHistory();
  }

  /** Mutation + commit en une fois (clic sur un bouton). */
  apply(fn: (p: Project) => Project): void {
    this.update(fn);
    this.commit();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this._committed());
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this._committed());
    this.restore(next);
  }

  /** Abandonne les modifications live non commitées. */
  revert(): void {
    this._project.set(this._committed());
  }

  private restore(p: Project): void {
    this._project.set(p);
    this._committed.set(p);
    if (this.selected() === null) this.selectedId.set(null);
    this.syncHistory();
  }

  private syncHistory(): void {
    this._history.set({ undo: this.undoStack.length, redo: this.redoStack.length });
  }

  /* ---------- actions ---------- */

  select(id: number | null): void {
    this.selectedId.set(id);
  }

  addShape(kind: AddKind): void {
    const p = this._project();
    const z = newShape(kind, p, nextId(p.zones));
    this.apply((q) => ({ ...q, zones: [...q.zones, z] }));
    this.selectedId.set(z.id);
  }

  deleteSelected(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.apply((p) => ({ ...p, zones: p.zones.filter((z) => z.id !== id) }));
    this.selectedId.set(null);
  }

  duplicateSelected(): void {
    const z = this.selected();
    if (!z) return;
    const p = this._project();
    const c = duplicateZone(z, nextId(p.zones));
    const i = p.zones.indexOf(z);
    this.apply((q) => ({ ...q, zones: [...q.zones.slice(0, i + 1), c, ...q.zones.slice(i + 1)] }));
    this.selectedId.set(c.id);
  }

  /** +1 : monte (passe devant), −1 : descend. */
  moveSelected(dir: 1 | -1): void {
    const id = this.selectedId();
    if (id === null) return;
    this.apply((p) => ({ ...p, zones: moveZone(p.zones, id, dir) }));
  }

  reorder(from: number, to: number): void {
    if (from === to) return;
    this.apply((p) => ({ ...p, zones: reorderZone(p.zones, from, to) }));
  }

  setPanelSize(w: number, h: number): void {
    this.apply((p) => resizePanel(p, w, h));
  }

  setView(view: Project['view']): void {
    this.apply((p) => ({ ...p, view }));
  }

  addPattern(o: PatternOptions, replace: boolean): void {
    this.apply((p) => ({
      ...p,
      zones: insertPattern(p.zones, generatePattern(o, p.panel, nextId(p.zones)), replace),
    }));
    this.selectedId.set(null);
  }

  /** Ouvre un autre projet : historique remis à zéro. */
  load(p: Project): void {
    this.undoStack = [];
    this.redoStack = [];
    this._project.set(p);
    this._committed.set(p);
    this.selectedId.set(null);
    this.syncHistory();
  }

  /** Ajoute des zones déjà construites (import SVG) devant les autres, et les sélectionne si une seule. */
  addZones(zones: Zone[]): void {
    if (!zones.length) return;
    this.apply((p) => {
      let id = nextId(p.zones);
      const added = zones.map((z) => ({ ...z, id: id++ }));
      return { ...p, zones: [...p.zones, ...added] };
    });
    const zs = this._committed().zones;
    this.selectedId.set(zones.length === 1 ? (zs[zs.length - 1]?.id ?? null) : null);
  }

  /** Repart d'un panneau vide en médium nu (mêmes dimensions et réglages). */
  clearZones(): void {
    this.apply((p) => ({ ...p, bg: { ...p.bg, mode: 'bois' }, zones: [] }));
    this.selectedId.set(null);
  }

  /** Importe un projet JSON. Renvoie false si le texte n'est pas un projet valide. */
  importJson(text: string): boolean {
    let o: unknown;
    try {
      o = JSON.parse(text);
    } catch {
      return false;
    }
    if (!looksLikeProject(o)) return false;
    this.apply(() => normalizeProject(o));
    this.selectedId.set(null);
    return true;
  }

  exportJson(): string {
    return JSON.stringify(this._committed());
  }
}
