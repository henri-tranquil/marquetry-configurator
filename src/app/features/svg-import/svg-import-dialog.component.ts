import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { bbox, clamp, pointInPolygon } from '../../core/geometry/geometry';
import {
  colorMapping,
  guessRoles,
  IMPORT_ROLES,
  ImportRole,
  planImport,
  readSvg,
  ROLE_LABELS,
  shapeArea,
  SvgReadResult,
} from '../../core/import/svg-import';
import { Point, Project, StrawColor } from '../../core/model/project';
import { fmt } from '../../shared/format';
import { ProjectThumbComponent } from '../../shared/ui/project-thumb.component';
import { StrawSelectComponent } from '../../shared/ui/straw-select.component';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

const MAX_BYTES = 5 * 1024 * 1024;

interface ShapeRow {
  index: number;
  name: string;
  fill: string;
  holes: number;
  /** Part de la surface du dessin (%). */
  share: number;
}

/**
 * Import d'un fichier SVG. Chaque forme remplie reçoit un rôle : plaque (le contour du panneau),
 * paille (une zone), trou (une découpe) ou ignorée. Les sous-chemins en creux restent des creux.
 * Le fichier est lu avec DOMParser, jamais inséré dans la page.
 */
@Component({
  selector: 'app-svg-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectThumbComponent, StrawSelectComponent],
  template: `
    <dialog #dlg aria-labelledby="svg-title" (close)="closed()">
      <div class="head">
        <h2 id="svg-title">Importer un dessin SVG</h2>
        <button type="button" class="x" aria-label="Fermer" (click)="dlg.close()">✕</button>
      </div>
      @if (error(); as e) {
        <p class="err" role="alert">{{ e }}</p>
      }
      @if (read(); as r) {
        <div class="body">
          <div class="left">
            <figure class="preview">
              <app-project-thumb [project]="preview()" [size]="360" [highlight]="highlight()" (pickedAt)="pickAt($event)" />
              <figcaption>
                {{ summary() }}{{ r.skipped ? ' · ' + r.skipped + ' ignorée' + (r.skipped > 1 ? 's' : '') + ' (sans remplissage ou minuscules)' : '' }}
                <br />Clique une forme sur l'aperçu pour choisir son rôle.
              </figcaption>
            </figure>
            <fieldset class="roles">
              <legend>Rôle de chaque forme</legend>
              <ul>
                @for (row of rows(); track row.index) {
                  <li [class.on]="selected() === row.index">
                    <button type="button" class="pickrow" [attr.aria-pressed]="selected() === row.index" (click)="selected.set(row.index)">
                      <i class="dot src" [style.--c]="row.fill"></i>
                      <span class="nm">{{ row.name }}</span>
                      <span class="n">{{ row.share < 1 ? '< 1' : fmt(row.share) }} %{{ row.holes ? ' · ' + row.holes + ' creux' : '' }}</span>
                    </button>
                    <select #rs [attr.aria-label]="'Rôle de ' + row.name" (change)="setRole(row.index, rs.value)">
                      @for (ro of roleList; track ro) {
                        <option [value]="ro" [selected]="roles()[row.index] === ro">{{ roleLabels[ro] }}</option>
                      }
                    </select>
                  </li>
                }
              </ul>
              <div class="row bulk">
                <button type="button" (click)="setSelectedRole('plaque')" [disabled]="selected() === null">Plaque</button>
                <button type="button" (click)="setSelectedRole('motif')" [disabled]="selected() === null">Paille</button>
                <button type="button" (click)="setSelectedRole('trou')" [disabled]="selected() === null">Trou</button>
                <button type="button" (click)="setSelectedRole('ignorer')" [disabled]="selected() === null">Ignorer</button>
              </div>
            </fieldset>
          </div>
          <div class="opts">
            <p class="file">{{ fileName() }}</p>
            <div class="g2">
              <label>
                {{ hasPlate() ? 'Largeur de la plaque' : 'Largeur du dessin' }}
                <span class="box"><input #wi type="number" min="5" step="1" [value]="round(width())" (change)="setWidth(+wi.value)" /><span class="unit">mm</span></span>
              </label>
              <label>
                Hauteur
                <span class="box"><input #hi type="number" min="5" step="1" [value]="round(height())" (change)="setHeight(+hi.value)" /><span class="unit">mm</span></span>
              </label>
            </div>
            <div class="row sizes">
              @if (hasPlate()) {
                <button type="button" (click)="setWidth(store.committed().panel.w)">Largeur du panneau actuel</button>
              } @else {
                <button type="button" (click)="fitPanel(0.8)">80 % du panneau</button>
                <button type="button" (click)="fitPanel(1)">Panneau entier</button>
              }
              @if (r.mmPerUnit) {
                <button type="button" title="Cotes du fichier" (click)="setWidth(naturalWidth())">Taille réelle</button>
              }
            </div>
            @if (hasPlate()) {
              <p class="note">La plaque devient le panneau : {{ fmt(planPanel()?.w ?? 0) }} × {{ fmt(planPanel()?.h ?? 0) }} mm, en médium nu. Le panneau reste rectangulaire : une plaque ronde donne sa boîte.</p>
            }
            <label>
              Sens du fil
              <span class="box"><input #an type="number" min="0" max="179" step="5" [value]="angle()" (change)="angle.set(clampAngle(+an.value))" /><span class="unit">°</span></span>
            </label>
            <fieldset>
              <legend>Couleurs de la paille</legend>
              <label class="chk"><input type="radio" name="cm" [checked]="mode() === 'auto'" (change)="mode.set('auto')" /> Paille la plus proche de chaque couleur</label>
              <label class="chk"><input type="radio" name="cm" [checked]="mode() === 'one'" (change)="mode.set('one')" /> Une seule paille</label>
              @if (mode() === 'auto') {
                <ul class="map">
                  @for (c of colors(); track c.fill) {
                    <li>
                      <i class="dot src" [style.--c]="c.fill" [title]="c.fill"></i>
                      <span class="arrow" aria-hidden="true">→</span>
                      <app-straw-select [label]="'Paille pour la couleur ' + c.fill" [value]="mapping()[c.fill] ?? c.straw" (picked)="setMap(c.fill, $event)" />
                    </li>
                  } @empty {
                    <li class="note">Aucune forme en paille.</li>
                  }
                </ul>
              } @else {
                <app-straw-select label="Paille" [value]="single()" (picked)="single.set($event)" />
              }
            </fieldset>
            <label>
              Finesse des contours · {{ maxPoints() }} points max
              <input #mp type="range" min="24" max="300" step="4" [value]="maxPoints()" [style.--pct.%]="((maxPoints() - 24) / 276) * 100" (input)="maxPoints.set(+mp.value)" />
            </label>
            <label class="chk"><input #rp type="checkbox" [checked]="replace()" (change)="replace.set(rp.checked)" /> Remplacer les formes existantes</label>
            @if (!hasPlate()) {
              <label class="chk"><input #fp type="checkbox" [checked]="fitToDrawing()" (change)="fitToDrawing.set(fp.checked)" /> Ajuster le panneau au dessin</label>
            }
          </div>
        </div>
        <div class="row end">
          <button type="button" (click)="dlg.close()">Annuler</button>
          <button type="button" class="primary" [disabled]="!plan().zones.length && !hasPlate()" (click)="confirm()">Importer</button>
        </div>
        <p class="note">
          Plaque : le contour du panneau. Paille : une zone posée dans l'ordre du fichier (la dernière passe devant). Trou : une
          découpe traversante. Les creux d'un dessin (l'intérieur d'un « O ») restent vides. Traits seuls, textes et dégradés
          sont ignorés.
        </p>
      }
    </dialog>
  `,
  styles: `
    dialog { border: 0; border-radius: 14px; padding: 18px 20px; width: min(960px, calc(100% - 24px)); max-height: calc(100dvh - 24px); background: var(--bg); color: var(--ink); }
    dialog::backdrop { background: rgba(10, 14, 12, 0.55); }
    .head { display: flex; justify-content: space-between; align-items: center; }
    h2 { margin: 0; }
    .x { border: 0; min-width: 44px; justify-content: center; background: transparent; }
    .body { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; margin-top: 10px; }
    @media (max-width: 760px) { .body { grid-template-columns: 1fr; } }
    .left { display: grid; gap: 10px; align-content: start; }
    .preview { margin: 0; padding: 12px; border-radius: 10px; background: #2c5a4e; display: grid; justify-items: center; align-content: center; gap: 8px; }
    .preview app-project-thumb { width: 100%; height: 300px; cursor: pointer; }
    figcaption { color: #e8efe9; font-size: 13px; text-align: center; }
    .opts { display: grid; gap: 10px; align-content: start; }
    .opts > label:not(.chk), .g2 label { display: grid; gap: 3px; color: var(--mute); font-size: 13px; }
    .file { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .box { position: relative; display: block; }
    .box input { width: 100%; padding-right: 2.6em; }
    .unit { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--mute); font-size: 14px; pointer-events: none; }
    .sizes button { flex: 1; justify-content: center; padding: 0 8px; font-size: 14px; }
    fieldset { border: 1px solid var(--line); border-radius: 10px; margin: 0; padding: 8px 12px 10px; display: grid; gap: 4px; min-width: 0; }
    legend { color: var(--mute); font-size: 13px; padding: 0 4px; }
    .roles ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 230px; overflow: auto; }
    .roles li { display: flex; align-items: center; gap: 6px; border-radius: 8px; padding: 2px; }
    .roles li.on { background: var(--soft); box-shadow: inset 0 0 0 1px var(--acc); }
    .pickrow { flex: 1; min-width: 0; border: 0; background: transparent; justify-content: flex-start; gap: 8px; padding: 0 6px; }
    .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .roles select { width: 7.5em; flex: none; }
    .bulk button { flex: 1; justify-content: center; padding: 0 6px; font-size: 14px; }
    .map { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; max-height: 210px; overflow: auto; }
    .map li { display: flex; align-items: center; gap: 8px; }
    .map app-straw-select { flex: 1; min-width: 0; }
    .src { width: 22px; height: 22px; flex: none; }
    .arrow, .n { color: var(--mute); font-size: 13px; white-space: nowrap; }
    .n { margin-left: auto; }
    .err { color: var(--acc); font-weight: 600; }
    .end { justify-content: flex-end; margin-top: 14px; }
    .note { margin: 8px 0 0; }
  `,
})
export class SvgImportDialogComponent {
  protected readonly store = inject(ProjectStore);
  private readonly ui = inject(UiStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly fmt = fmt;
  protected readonly roleList = IMPORT_ROLES;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly read = signal<SvgReadResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly fileName = signal('');
  protected readonly width = signal(200);
  protected readonly angle = signal(90);
  protected readonly mode = signal<'auto' | 'one'>('auto');
  protected readonly single = signal<StrawColor>('naturel');
  protected readonly mapping = signal<Record<string, StrawColor>>({});
  protected readonly maxPoints = signal(120);
  protected readonly replace = signal(false);
  protected readonly fitToDrawing = signal(false);
  protected readonly roles = signal<ImportRole[]>([]);
  protected readonly selected = signal<number | null>(null);

  protected readonly hasPlate = computed(() => this.roles().includes('plaque'));
  /** Boîte de référence : la plaque si elle existe, sinon tout le dessin (unités SVG). */
  private readonly refBox = computed(() => {
    const r = this.read();
    if (!r) return [0, 0, 1, 1] as const;
    const plate = r.shapes[this.roles().indexOf('plaque')];
    return plate ? bbox(plate.pts) : r.box;
  });
  private readonly aspect = computed(() => {
    const b = this.refBox();
    return Math.max(1e-6, b[3] - b[1]) / Math.max(1e-6, b[2] - b[0]);
  });
  protected readonly height = computed(() => this.width() * this.aspect());
  protected readonly naturalWidth = computed(() => {
    const r = this.read();
    const b = this.refBox();
    return r?.mmPerUnit ? (b[2] - b[0]) * r.mmPerUnit : this.width();
  });

  protected readonly rows = computed<ShapeRow[]>(() => {
    const r = this.read();
    if (!r) return [];
    const total = Math.max(1e-9, (r.box[2] - r.box[0]) * (r.box[3] - r.box[1]));
    return r.shapes.map((s, index) => ({
      index,
      name: s.label ?? `Forme ${index + 1}`,
      fill: s.fill ?? '#d6b25c',
      holes: s.holes.length,
      share: (shapeArea(s) / total) * 100,
    }));
  });

  /** Couleurs des seules formes en paille. */
  protected readonly colors = computed(() => {
    const r = this.read();
    if (!r) return [];
    const roles = this.roles();
    return colorMapping({ ...r, shapes: r.shapes.filter((_, i) => (roles[i] ?? 'motif') === 'motif') });
  });

  /** Panneau cible sans plaque : actuel, ou ajusté au dessin. */
  private readonly targetPanel = computed<Project['panel']>(() => {
    const p = this.store.committed().panel;
    if (!this.fitToDrawing()) return p;
    return { w: Math.round(this.width()), h: Math.round(this.height()) };
  });

  protected readonly plan = computed(() => {
    const r = this.read();
    if (!r) return { zones: [], panel: null, outlines: [] };
    const panel = this.targetPanel();
    return planImport(
      r,
      {
        width: this.width(),
        x: (panel.w - this.width()) / 2,
        y: (panel.h - this.height()) / 2,
        angle: this.angle(),
        color: this.mode() === 'auto' ? 'auto' : this.single(),
        mapping: this.mapping(),
        maxPoints: this.maxPoints(),
        roles: this.roles(),
      },
      1,
    );
  });
  protected readonly planPanel = computed(() => this.plan().panel);

  protected readonly summary = computed(() => {
    const zs = this.plan().zones;
    const holes = zs.filter((z) => z.hole).length;
    const straw = zs.length - holes;
    const parts = [`${straw} zone${straw > 1 ? 's' : ''} de paille`];
    if (holes) parts.push(`${holes} trou${holes > 1 ? 's' : ''}`);
    if (this.hasPlate()) parts.push('1 plaque');
    return parts.join(' · ');
  });

  protected readonly preview = computed<Project>(() => {
    const p = this.store.committed();
    const plan = this.plan();
    const kept = this.replace() ? [] : p.zones;
    const imported = plan.zones.map((z, i) => ({ ...z, id: 100000 + i }));
    const zones = [...kept.filter((z) => !z.hole), ...imported.filter((z) => !z.hole), ...kept.filter((z) => z.hole), ...imported.filter((z) => z.hole)];
    if (plan.panel) return { ...p, panel: plan.panel, bg: { ...p.bg, mode: 'bois' }, zones };
    return { ...p, panel: this.targetPanel(), zones };
  });

  protected readonly highlight = computed<Point[] | null>(() => {
    const i = this.selected();
    return i === null ? null : (this.plan().outlines[i] ?? null);
  });

  constructor() {
    effect(() => {
      const f = this.ui.svgFile();
      if (f) untracked(() => void this.load(f));
    });
  }

  private async load(f: File): Promise<void> {
    this.error.set(null);
    this.read.set(null);
    this.selected.set(null);
    this.fileName.set(f.name);
    const d = this.dialog().nativeElement;
    if (!d.open) d.showModal();
    if (f.size > MAX_BYTES) {
      this.error.set(`Fichier trop lourd (${fmt(f.size / 1048576, 1)} Mo, 5 Mo au plus).`);
      return;
    }
    let text: string;
    try {
      text = await f.text();
    } catch {
      this.error.set('Impossible de lire ce fichier.');
      return;
    }
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.querySelector('parsererror') || root.tagName.replace(/^svg:/, '') !== 'svg') {
      this.error.set("Ce fichier n'est pas un SVG lisible. Exporte-le en « SVG simple » depuis ton logiciel de dessin.");
      return;
    }
    const r = readSvg(root);
    if (!r.shapes.length) {
      this.error.set('Aucune forme remplie dans ce fichier. Les contours seuls (sans remplissage) et les textes ne sont pas importés : convertis-les en objets remplis.');
      return;
    }
    this.mapping.set({});
    this.roles.set(guessRoles(r));
    this.read.set(r);
    // taille de départ : taille réelle si elle tient ; avec une plaque, sinon la largeur du panneau
    const panel = this.store.committed().panel;
    const real = this.naturalWidth();
    if (r.mmPerUnit && real <= panel.w * 1.001 && real * this.aspect() <= panel.h * 1.001) this.width.set(real);
    else if (this.hasPlate()) this.width.set(r.mmPerUnit ? real : panel.w);
    else this.fitPanel(0.8);
  }

  protected setRole(i: number, v: string): void {
    if (!(IMPORT_ROLES as readonly string[]).includes(v)) return;
    const role = v as ImportRole;
    this.selected.set(i);
    this.roles.update((rs) =>
      rs.map((r, k) => {
        if (k === i) return role;
        // une seule plaque
        return role === 'plaque' && r === 'plaque' ? 'motif' : r;
      }),
    );
  }

  protected setSelectedRole(role: ImportRole): void {
    const i = this.selected();
    if (i !== null) this.setRole(i, role);
  }

  /** Clic sur l'aperçu : la forme la plus en avant sous le pointeur. */
  protected pickAt([x, y]: Point): void {
    const outs = this.plan().outlines;
    for (let i = outs.length - 1; i >= 0; i--) {
      const o = outs[i];
      if (o && pointInPolygon(o, x, y)) {
        this.selected.set(i);
        return;
      }
    }
    this.selected.set(null);
  }

  protected fitPanel(f: number): void {
    const p = this.store.committed().panel;
    this.width.set(Math.max(5, Math.min(p.w * f, (p.h * f) / this.aspect())));
  }

  protected setWidth(v: number): void {
    if (Number.isFinite(v) && v > 0) this.width.set(clamp(v, 5, 5000));
  }

  protected setHeight(v: number): void {
    if (Number.isFinite(v) && v > 0) this.width.set(clamp(v / this.aspect(), 5, 5000));
  }

  protected setMap(fill: string, c: StrawColor): void {
    this.mapping.update((m) => ({ ...m, [fill]: c }));
  }

  protected clampAngle(v: number): number {
    return Number.isFinite(v) ? clamp(Math.round(v), 0, 179) : 0;
  }

  protected round(v: number): number {
    return Math.round(v * 10) / 10;
  }

  protected confirm(): void {
    const plan = this.plan();
    if (!plan.zones.length && !plan.panel) return;
    const panel = plan.panel ?? (this.fitToDrawing() ? this.targetPanel() : null);
    this.store.update((p) => ({
      ...p,
      panel: panel ?? p.panel,
      bg: plan.panel ? { ...p.bg, mode: 'bois' } : p.bg,
      zones: this.replace() ? [] : p.zones,
    }));
    if (plan.zones.length) this.store.addZones(plan.zones);
    else this.store.commit();
    this.dialog().nativeElement.close();
  }

  protected closed(): void {
    this.ui.svgFile.set(null);
  }
}
