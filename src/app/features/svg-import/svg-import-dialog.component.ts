import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { clamp } from '../../core/geometry/geometry';
import { colorMapping, readSvg, SvgReadResult, svgToZones } from '../../core/import/svg-import';
import { PALETTE, Project, STRAW_COLORS, StrawColor } from '../../core/model/project';
import { fmt } from '../../shared/format';
import { ProjectThumbComponent } from '../../shared/ui/project-thumb.component';
import { ProjectStore } from '../../state/project.store';
import { UiStore } from '../../state/ui.store';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Import d'un fichier SVG : chaque forme remplie devient une zone libre (modifiable ensuite),
 * dans l'ordre du fichier. Le fichier est lu avec DOMParser, jamais inséré dans la page.
 */
@Component({
  selector: 'app-svg-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectThumbComponent],
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
          <figure class="preview">
            <app-project-thumb [project]="preview()" [size]="340" />
            <figcaption>{{ zones().length }} forme{{ zones().length > 1 ? 's' : '' }}{{ r.skipped ? ' · ' + r.skipped + ' ignorée' + (r.skipped > 1 ? 's' : '') + ' (sans remplissage ou minuscules)' : '' }}</figcaption>
          </figure>
          <div class="opts">
            <p class="file">{{ fileName() }}</p>
            <div class="g2">
              <label>
                Largeur du dessin
                <span class="box"><input #wi type="number" min="5" step="1" [value]="round(width())" (change)="setWidth(+wi.value)" /><span class="unit">mm</span></span>
              </label>
              <label>
                Hauteur
                <span class="box"><input #hi type="number" min="5" step="1" [value]="round(height())" (change)="setHeight(+hi.value)" /><span class="unit">mm</span></span>
              </label>
            </div>
            <div class="row sizes">
              <button type="button" (click)="fitPanel(0.8)">80 % du panneau</button>
              <button type="button" (click)="fitPanel(1)">Panneau entier</button>
              @if (r.mmPerUnit) {
                <button type="button" title="Cotes du fichier" (click)="setWidth(naturalWidth())">Taille réelle</button>
              }
            </div>
            <label>
              Sens du fil
              <span class="box"><input #an type="number" min="0" max="179" step="5" [value]="angle()" (change)="angle.set(clampAngle(+an.value))" /><span class="unit">°</span></span>
            </label>
            <fieldset>
              <legend>Couleurs</legend>
              <label class="chk"><input type="radio" name="cm" [checked]="mode() === 'auto'" (change)="mode.set('auto')" /> Paille la plus proche de chaque couleur</label>
              <label class="chk"><input type="radio" name="cm" [checked]="mode() === 'one'" (change)="mode.set('one')" /> Une seule paille</label>
              @if (mode() === 'auto') {
                <ul class="map">
                  @for (c of colors(); track c.fill) {
                    <li>
                      <i class="dot src" [style.--c]="c.fill" [title]="c.fill"></i>
                      <span class="arrow" aria-hidden="true">→</span>
                      <select #cs [attr.aria-label]="'Paille pour la couleur ' + c.fill" (change)="setMap(c.fill, cs.value)">
                        @for (s of straws; track s) {
                          <option [value]="s" [selected]="(mapping()[c.fill] ?? c.straw) === s">{{ palette[s].label }}</option>
                        }
                      </select>
                      <span class="n">{{ c.count }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <select #one aria-label="Paille" (change)="setSingle(one.value)">
                  @for (s of straws; track s) {
                    <option [value]="s" [selected]="single() === s">{{ palette[s].label }}</option>
                  }
                </select>
              }
            </fieldset>
            <label>
              Finesse des contours · {{ maxPoints() }} points max
              <input #mp type="range" min="24" max="300" step="4" [value]="maxPoints()" [style.--pct.%]="((maxPoints() - 24) / 276) * 100" (input)="maxPoints.set(+mp.value)" />
            </label>
            <label class="chk"><input #rp type="checkbox" [checked]="replace()" (change)="replace.set(rp.checked)" /> Remplacer les formes existantes (les trous restent)</label>
            <label class="chk"><input #fp type="checkbox" [checked]="fitToDrawing()" (change)="fitToDrawing.set(fp.checked)" /> Ajuster le panneau au dessin</label>
          </div>
        </div>
        <div class="row end">
          <button type="button" (click)="dlg.close()">Annuler</button>
          <button type="button" class="primary" [disabled]="!zones().length" (click)="confirm()">Importer {{ zones().length }} forme{{ zones().length > 1 ? 's' : '' }}</button>
        </div>
        <p class="note">Chaque forme remplie du fichier devient une zone libre, posée dans l'ordre du fichier (la dernière passe devant). Les traits seuls, textes et dégradés sont ignorés.</p>
      }
    </dialog>
  `,
  styles: `
    dialog { border: 0; border-radius: 14px; padding: 18px 20px; width: min(860px, calc(100% - 24px)); max-height: calc(100dvh - 24px); background: var(--bg); color: var(--ink); }
    dialog::backdrop { background: rgba(10, 14, 12, 0.55); }
    .head { display: flex; justify-content: space-between; align-items: center; }
    h2 { margin: 0; }
    .x { border: 0; min-width: 44px; justify-content: center; background: transparent; }
    .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; margin-top: 10px; }
    @media (max-width: 700px) { .body { grid-template-columns: 1fr; } }
    .preview { margin: 0; padding: 12px; border-radius: 10px; background: #2c5a4e; display: grid; justify-items: center; align-content: center; gap: 8px; }
    .preview app-project-thumb { width: 100%; height: 320px; }
    figcaption { color: #e8efe9; font-size: 13px; text-align: center; }
    .opts { display: grid; gap: 10px; align-content: start; }
    .opts > label:not(.chk), .g2 label { display: grid; gap: 3px; color: var(--mute); font-size: 13px; }
    .file { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .box { position: relative; display: block; }
    .box input { width: 100%; padding-right: 2.6em; }
    .unit { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--mute); font-size: 14px; pointer-events: none; }
    .sizes button { flex: 1; justify-content: center; padding: 0 8px; font-size: 14px; }
    fieldset { border: 1px solid var(--line); border-radius: 10px; margin: 0; padding: 8px 12px 10px; display: grid; gap: 4px; }
    legend { color: var(--mute); font-size: 13px; padding: 0 4px; }
    .map { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; max-height: 190px; overflow: auto; }
    .map li { display: flex; align-items: center; gap: 8px; }
    .map select { flex: 1; }
    .src { width: 22px; height: 22px; }
    .arrow, .n { color: var(--mute); font-size: 13px; }
    .err { color: var(--acc); font-weight: 600; }
    .end { justify-content: flex-end; margin-top: 14px; }
    .note { margin: 8px 0 0; }
  `,
})
export class SvgImportDialogComponent {
  private readonly store = inject(ProjectStore);
  private readonly ui = inject(UiStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly palette = PALETTE;
  protected readonly straws = STRAW_COLORS;

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

  private readonly aspect = computed(() => {
    const r = this.read();
    if (!r) return 1;
    return Math.max(1e-6, r.box[3] - r.box[1]) / Math.max(1e-6, r.box[2] - r.box[0]);
  });
  protected readonly height = computed(() => this.width() * this.aspect());
  protected readonly naturalWidth = computed(() => {
    const r = this.read();
    return r?.mmPerUnit ? (r.box[2] - r.box[0]) * r.mmPerUnit : this.width();
  });
  protected readonly colors = computed(() => (this.read() ? colorMapping(this.read()!) : []));

  /** Panneau cible : actuel, ou ajusté au dessin. */
  private readonly targetPanel = computed<Project['panel']>(() => {
    const p = this.store.committed().panel;
    if (!this.fitToDrawing()) return p;
    return { w: Math.round(this.width()), h: Math.round(this.height()) };
  });

  protected readonly zones = computed(() => {
    const r = this.read();
    if (!r) return [];
    const panel = this.targetPanel();
    return svgToZones(
      r,
      {
        width: this.width(),
        x: (panel.w - this.width()) / 2,
        y: (panel.h - this.height()) / 2,
        angle: this.angle(),
        color: this.mode() === 'auto' ? 'auto' : this.single(),
        mapping: this.mapping(),
        maxPoints: this.maxPoints(),
      },
      1,
    );
  });

  protected readonly preview = computed<Project>(() => {
    const p = this.store.committed();
    const kept = this.replace() ? p.zones.filter((z) => z.hole) : p.zones;
    const imported = this.zones().map((z, i) => ({ ...z, id: 100000 + i }));
    return { ...p, panel: this.targetPanel(), zones: [...kept.filter((z) => !z.hole), ...imported, ...kept.filter((z) => z.hole)] };
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
      this.error.set("Aucune forme remplie dans ce fichier. Les contours seuls (sans remplissage) et les textes ne sont pas importés : convertis-les en objets remplis.");
      return;
    }
    this.mapping.set({});
    this.read.set(r);
    // taille de départ : taille réelle si elle tient, sinon 80 % du panneau
    const panel = this.store.committed().panel;
    const bw = r.box[2] - r.box[0];
    const bh = r.box[3] - r.box[1];
    const real = r.mmPerUnit ? bw * r.mmPerUnit : 0;
    if (real && real <= panel.w && bh * r.mmPerUnit! <= panel.h) this.width.set(real);
    else this.fitPanel(0.8);
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

  protected setMap(fill: string, v: string): void {
    if ((STRAW_COLORS as readonly string[]).includes(v)) this.mapping.update((m) => ({ ...m, [fill]: v as StrawColor }));
  }

  protected setSingle(v: string): void {
    if ((STRAW_COLORS as readonly string[]).includes(v)) this.single.set(v as StrawColor);
  }

  protected clampAngle(v: number): number {
    return Number.isFinite(v) ? clamp(Math.round(v), 0, 179) : 0;
  }

  protected round(v: number): number {
    return Math.round(v * 10) / 10;
  }

  protected confirm(): void {
    const zones = this.zones();
    if (!zones.length) return;
    if (this.fitToDrawing() || this.replace()) {
      const panel = this.targetPanel();
      this.store.update((p) => ({ ...p, panel, zones: this.replace() ? p.zones.filter((z) => z.hole) : p.zones }));
    }
    this.store.addZones(zones);
    this.dialog().nativeElement.close();
  }

  protected closed(): void {
    this.ui.svgFile.set(null);
  }
}
