import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { prepare } from '../core/geometry/geometry';
import { blankProject, looksLikeProject, normalizeProject } from '../core/model/normalize';
import { Project } from '../core/model/project';
import { drawStrawPanel } from '../render/straw-2d.renderer';
import { ProjectStore } from './project.store';

export interface ProjectMeta {
  id: string;
  name: string;
  /** Horodatage de la dernière modification (ms). */
  updated: number;
  /** Vignette en data URL (petite image JPEG). */
  thumb: string;
  w: number;
  h: number;
}

const INDEX_KEY = 'atelier-paille-projets';
const CURRENT_KEY = 'atelier-paille-projet-courant';
const slotKey = (id: string) => `atelier-paille-projet-${id}`;
const MAX_NAME = 40;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

function cleanIndex(v: unknown): ProjectMeta[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .filter((m) => typeof m['id'] === 'string')
    .map((m) => ({
      id: String(m['id']),
      name: String(m['name'] ?? 'Projet').slice(0, MAX_NAME),
      updated: Number(m['updated']) || 0,
      thumb: typeof m['thumb'] === 'string' && m['thumb'].startsWith('data:image/') ? m['thumb'] : '',
      w: Number(m['w']) || 0,
      h: Number(m['h']) || 0,
    }));
}

/** Vignette du rendu paille, sans décorations. */
export function thumbnail(p: Project, size = 160): string {
  try {
    const k = size / Math.max(p.panel.w, p.panel.h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(p.panel.w * k));
    c.height = Math.max(1, Math.round(p.panel.h * k));
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    drawStrawPanel(ctx, p, prepare(p.zones), { view: { scale: k, ox: 0, oy: 0 }, fiber: null, decorations: false, mode: 'shaded' });
    return c.toDataURL('image/jpeg', 0.75);
  } catch {
    return '';
  }
}

/**
 * Plusieurs projets dans le navigateur. Le projet courant reste dans le ProjectStore ;
 * il est recopié dans son emplacement (avec une vignette) peu après chaque modification validée.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  private readonly store = inject(ProjectStore);
  readonly list = signal<ProjectMeta[]>(cleanIndex(read(INDEX_KEY, [])));
  readonly currentId = signal<string>('');
  private timer = 0;

  constructor() {
    let cur = read<string>(CURRENT_KEY, '');
    const latest = [...this.list()].sort((a, b) => b.updated - a.updated)[0];
    // projet courant perdu : on reprend le plus récent plutôt que d'en créer un autre
    if (!this.list().some((m) => m.id === cur) && latest) cur = latest.id;
    if (!this.list().some((m) => m.id === cur)) {
      // premier lancement (ou index perdu) : le projet en cours devient « Mon projet »
      cur = this.newId();
      this.list.update((l) => [...l, { id: cur, name: 'Mon projet', updated: Date.now(), thumb: '', w: 0, h: 0 }]);
    }
    this.currentId.set(cur);
    write(CURRENT_KEY, JSON.stringify(cur));
    effect(() => {
      const p = this.store.committed();
      untracked(() => {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.save(p), 800);
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  private persistIndex(): void {
    write(INDEX_KEY, this.list());
  }

  /** Enregistre le projet courant dans son emplacement. */
  save(p: Project = this.store.committed()): void {
    clearTimeout(this.timer);
    const id = this.currentId();
    write(slotKey(id), p);
    const thumb = thumbnail(p);
    this.list.update((l) => l.map((m) => (m.id === id ? { ...m, updated: Date.now(), thumb: thumb || m.thumb, w: p.panel.w, h: p.panel.h } : m)));
    this.persistIndex();
  }

  open(id: string): void {
    if (id === this.currentId()) return;
    const raw = read<unknown>(slotKey(id), null);
    if (!looksLikeProject(raw)) return;
    this.save();
    this.currentId.set(id);
    write(CURRENT_KEY, JSON.stringify(id));
    this.store.load(normalizeProject(raw));
  }

  /** Crée un projet (copie de `from`, sinon panneau vide) et l'ouvre. */
  create(name: string, from?: Project): void {
    this.save();
    const id = this.newId();
    const p = from ?? blankProject(this.store.committed().panel);
    this.list.update((l) => [...l, { id, name: name.slice(0, MAX_NAME) || 'Nouveau projet', updated: Date.now(), thumb: '', w: p.panel.w, h: p.panel.h }]);
    this.currentId.set(id);
    write(CURRENT_KEY, JSON.stringify(id));
    this.store.load(p);
    this.save(p);
  }

  duplicate(id: string): void {
    const m = this.list().find((q) => q.id === id);
    const raw = id === this.currentId() ? this.store.committed() : read<unknown>(slotKey(id), null);
    if (!m || !looksLikeProject(raw)) return;
    this.create(`${m.name} (copie)`.slice(0, MAX_NAME), normalizeProject(raw));
  }

  rename(id: string, name: string): void {
    const n = name.trim().slice(0, MAX_NAME);
    if (!n) return;
    this.list.update((l) => l.map((m) => (m.id === id ? { ...m, name: n } : m)));
    this.persistIndex();
  }

  /** Supprime un projet ; le projet ouvert ne peut pas l'être (on en ouvre un autre d'abord). */
  remove(id: string): void {
    if (id === this.currentId()) return;
    try {
      localStorage.removeItem(slotKey(id));
    } catch {
      /* rien */
    }
    this.list.update((l) => l.filter((m) => m.id !== id));
    this.persistIndex();
  }
}
