import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { exampleProject } from '../../core/model/normalize';
import { fmt } from '../../shared/format';
import { ProjectsStore } from '../../state/projects.store';
import { UiStore } from '../../state/ui.store';

/** Projets enregistrés dans ce navigateur : ouvrir, créer, dupliquer, renommer, supprimer. */
@Component({
  selector: 'app-projects-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg aria-labelledby="pj-title" (close)="ui.projectsOpen.set(false)">
      <div class="head">
        <h2 id="pj-title">Mes projets</h2>
        <button type="button" class="x" aria-label="Fermer" (click)="dlg.close()">✕</button>
      </div>
      <div class="row">
        <button type="button" class="primary" (click)="create()">Nouveau panneau vide</button>
        <button type="button" (click)="createExample()">Nouveau depuis l'exemple</button>
      </div>
      <ul class="grid">
        @for (m of sorted(); track m.id) {
          <li [class.cur]="m.id === projects.currentId()">
            <button type="button" class="open" [attr.aria-label]="'Ouvrir ' + m.name" (click)="open(m.id)">
              @if (m.thumb) {
                <img [src]="m.thumb" alt="" />
              } @else {
                <span class="empty" aria-hidden="true"></span>
              }
            </button>
            <div class="meta">
              @if (editing() === m.id) {
                <input #nm type="text" maxlength="40" aria-label="Nom du projet" [value]="m.name" (keydown.enter)="nm.blur()" (keydown.escape)="editing.set(null)" (blur)="rename(m.id, nm.value)" />
              } @else {
                <button type="button" class="name" title="Renommer" (click)="startEdit(m.id)">{{ m.name }}</button>
              }
              <span class="sub">
                @if (m.id === projects.currentId()) {
                  <b>ouvert</b> ·
                }
                {{ m.w && m.h ? fmt(m.w) + ' × ' + fmt(m.h) + ' mm · ' : '' }}{{ when(m.updated) }}
              </span>
              <div class="acts">
                <button type="button" (click)="projects.duplicate(m.id); dlg.close()">Dupliquer</button>
                @if (m.id !== projects.currentId()) {
                  @if (confirmDel() === m.id) {
                    <button type="button" class="danger" (click)="projects.remove(m.id); confirmDel.set(null)">Confirmer</button>
                  } @else {
                    <button type="button" (click)="confirmDel.set(m.id)">Supprimer</button>
                  }
                }
              </div>
            </div>
          </li>
        }
      </ul>
      <p class="note">Les projets restent dans ce navigateur. Pour les garder ailleurs, utilise « Copier le projet » dans Exporter.</p>
    </dialog>
  `,
  styles: `
    dialog { border: 0; border-radius: 14px; padding: 18px 20px; width: min(860px, calc(100% - 24px)); max-height: calc(100dvh - 24px); background: var(--bg); color: var(--ink); }
    dialog::backdrop { background: rgba(10, 14, 12, 0.55); }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    h2 { margin: 0; }
    .x { border: 0; min-width: 44px; justify-content: center; background: transparent; }
    .grid { list-style: none; padding: 0; margin: 14px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
    li { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; display: grid; }
    li.cur { border-color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); }
    .open { height: 150px; border: 0; border-radius: 0; padding: 8px; background: #2c5a4e; justify-content: center; }
    .open img { max-width: 100%; max-height: 100%; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); }
    .empty { width: 60%; height: 80%; border: 2px dashed rgba(255, 255, 255, 0.4); border-radius: 4px; }
    .meta { padding: 8px 10px 10px; display: grid; gap: 2px; }
    .name { border: 0; padding: 0; min-height: 32px; background: transparent; font-weight: 600; justify-content: flex-start; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name:hover { text-decoration: underline; }
    .meta input { min-height: 36px; }
    .sub { color: var(--mute); font-size: 13px; }
    .acts { display: flex; gap: 6px; margin-top: 6px; }
    .acts button { flex: 1; justify-content: center; padding: 0 6px; font-size: 14px; min-height: 40px; }
    .danger { color: #fff; background: var(--acc); border-color: var(--acc); }
  `,
})
export class ProjectsDialogComponent {
  protected readonly projects = inject(ProjectsStore);
  protected readonly ui = inject(UiStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly fmt = fmt;
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmDel = signal<string | null>(null);
  protected readonly sorted = computed(() => [...this.projects.list()].sort((a, b) => b.updated - a.updated));
  private readonly date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

  constructor() {
    effect(() => {
      const d = this.dialog().nativeElement;
      if (this.ui.projectsOpen() && !d.open) {
        // vignette du projet ouvert à jour
        this.projects.save();
        this.confirmDel.set(null);
        d.showModal();
      }
      if (!this.ui.projectsOpen() && d.open) d.close();
    });
  }

  protected when(t: number): string {
    return t ? this.date.format(t) : '';
  }

  protected open(id: string): void {
    this.projects.open(id);
    this.dialog().nativeElement.close();
  }

  protected create(): void {
    this.projects.create(`Projet ${this.projects.list().length + 1}`);
    this.dialog().nativeElement.close();
  }

  protected createExample(): void {
    this.projects.create('Porte de buffet (exemple)', exampleProject());
    this.dialog().nativeElement.close();
  }

  protected startEdit(id: string): void {
    this.editing.set(id);
    queueMicrotask(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('.meta input')?.select());
  }

  protected rename(id: string, v: string): void {
    if (this.editing() === id) this.projects.rename(id, v);
    this.editing.set(null);
  }
}
