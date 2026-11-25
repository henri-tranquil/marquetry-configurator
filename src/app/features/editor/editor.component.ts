import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { AddKind } from '../../core/model/operations';
import { FILL_LABELS, PANEL_PRESETS, PROFILE_LABELS, ViewMode } from '../../core/model/project';
import { fmt } from '../../shared/format';
import { PanelSectionComponent } from '../../shared/ui/panel-section.component';
import { SegmentedComponent, SegOption } from '../../shared/ui/segmented.component';
import { ProjectStore } from '../../state/project.store';
import { ViewCommands } from '../../state/view-commands';
import { BomPanelComponent } from '../bom-panel/bom-panel.component';
import { EdgesPanelComponent } from '../edges-panel/edges-panel.component';
import { ExportPanelComponent } from '../export-panel/export-panel.component';
import { InspectorComponent } from '../inspector/inspector.component';
import { LayersPanelComponent } from '../layers-panel/layers-panel.component';
import { LightPanelComponent } from '../light-panel/light-panel.component';
import { PatternsPanelComponent } from '../patterns-panel/patterns-panel.component';
import { ProjectsDialogComponent } from '../projects/projects-dialog.component';
import { SvgImportDialogComponent } from '../svg-import/svg-import-dialog.component';
import { ProjectsStore } from '../../state/projects.store';
import { UiStore } from '../../state/ui.store';
import { ContextMenuComponent } from './context-menu.component';
import { FirstTipComponent } from './first-tip.component';
import { GuideCardComponent } from './guide-card.component';
import { HelpDialogComponent } from './help-dialog.component';
import { StageCanvasComponent } from './stage-canvas.component';
import { SuggestionsBarComponent } from './suggestions-bar.component';
import { SuggestionsStore } from '../../state/suggestions.store';
import { Viewer3dComponent } from './viewer-3d.component';

interface Tool {
  kind: AddKind;
  label: string;
}

@Component({
  selector: 'app-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SegmentedComponent,
    PanelSectionComponent,
    StageCanvasComponent,
    Viewer3dComponent,
    InspectorComponent,
    LightPanelComponent,
    EdgesPanelComponent,
    PatternsPanelComponent,
    LayersPanelComponent,
    BomPanelComponent,
    ExportPanelComponent,
    ContextMenuComponent,
    GuideCardComponent,
    FirstTipComponent,
    HelpDialogComponent,
    SvgImportDialogComponent,
    ProjectsDialogComponent,
    SuggestionsBarComponent,
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class EditorComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly p = this.store.project;
  protected readonly presets = PANEL_PRESETS;
  protected readonly fmt = fmt;
  protected readonly is3d = computed(() => this.p().view === '3d');
  protected readonly ui = inject(UiStore);
  protected readonly sg = inject(SuggestionsStore);
  protected readonly zoomLabel = computed(() => `${Math.round(this.ui.zoomLevel() * 100)} %`);
  private readonly projects = inject(ProjectsStore);
  protected readonly currentName = computed(() => this.projects.list().find((m) => m.id === this.projects.currentId())?.name ?? 'Projet');
  /** Libellé de la poignée du panneau mobile : ce qui est sélectionné. */
  protected readonly sheetLabel = computed(() => {
    const z = this.store.selected();
    return z ? `Réglages · ${z.name}` : 'Réglages';
  });

  /* résumés affichés quand une section est repliée */
  protected readonly selSummary = computed(() => {
    const z = this.store.selected();
    if (!z) return 'rien de sélectionné';
    const kind = z.hole ? 'trou' : FILL_LABELS[z.fill?.type ?? 'parallele'].toLowerCase();
    return `${z.name} · ${kind}`;
  });
  protected readonly lightSummary = computed(() => {
    const p = this.p();
    return `${Math.round(p.light)}° · reflets ${Math.round(p.contrast * 100)} % · brins ${fmt(p.sw, 1)} mm`;
  });
  protected readonly layersSummary = computed(() => {
    const zs = this.p().zones;
    const holes = zs.filter((z) => z.hole).length;
    const n = zs.length - holes;
    return `${n} forme${n > 1 ? 's' : ''}${holes ? ` · ${holes} trou${holes > 1 ? 's' : ''}` : ''}`;
  });
  protected readonly edgesSummary = computed(() => {
    const p = this.p();
    const e = p.edge.type === 'droit' ? 'chant droit' : `${PROFILE_LABELS[p.edge.type].toLowerCase()} ${fmt(p.edge.size, p.edge.size % 1 ? 1 : 0)} mm`;
    return `${fmt(p.thick)} mm · ${e}`;
  });
  protected readonly bomSummary = computed(() => `≈ ${fmt(this.store.bom().totalMeters, 1)} m de bande`);
  protected readonly views: SegOption<ViewMode>[] = [
    { value: 'rendu', label: 'Rendu paille' },
    { value: 'plan', label: 'Plan de pose' },
    { value: '3d', label: 'Vue 3D' },
  ];
  protected readonly shapes: Tool[] = [
    { kind: 'rect', label: 'Rectangle' },
    { kind: 'ellipse', label: 'Ellipse' },
    { kind: 'tri', label: 'Triangle' },
    { kind: 'diamond', label: 'Losange' },
    { kind: 'hex', label: 'Hexagone' },
  ];
  protected readonly holesTools: Tool[] = [
    { kind: 'hole-round', label: 'Trou rond' },
    { kind: 'hole-slot', label: 'Trou oblong' },
  ];

  private readonly commands = inject(ViewCommands);
  private nudgeTimer = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.nudgeTimer));
  }

  protected applyPreset(sel: HTMLSelectElement): void {
    const pr = this.presets[Number(sel.value)];
    if (pr) this.store.setPanelSize(pr.w, pr.h);
    sel.value = '';
  }

  protected setWidth(v: string): void {
    const n = Number(v);
    this.store.setPanelSize(Number.isFinite(n) && v !== '' ? n : this.p().panel.w, this.p().panel.h);
  }

  protected setHeight(v: string): void {
    const n = Number(v);
    this.store.setPanelSize(this.p().panel.w, Number.isFinite(n) && v !== '' ? n : this.p().panel.h);
  }

  protected pickSvg(input: HTMLInputElement): void {
    const f = input.files?.[0];
    if (f) this.ui.svgFile.set(f);
    input.value = '';
  }

  protected toggleGuide(): void {
    if (this.ui.guideStep() !== null) this.ui.guideStep.set(null);
    else {
      this.store.select(null);
      this.ui.guideStep.set(0);
    }
  }

  protected frontView(): void {
    this.commands.requestFrontView();
  }

  /** Raccourcis clavier, ignorés quand le focus est dans un champ. */
  protected onKey(e: KeyboardEvent): void {
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest('input, textarea, select, [contenteditable]') || t.closest('dialog'))) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.key === '?') {
      e.preventDefault();
      this.ui.helpOpen.set(true);
      return;
    }
    // pose guidée : flèches pour avancer, Échap pour quitter
    const g = this.ui.guideStep();
    if (g !== null && this.p().view === 'plan') {
      const n = this.store.layingSteps().length;
      if (e.key === 'Escape') this.ui.guideStep.set(null);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') this.ui.guideStep.set(Math.min(n - 1, g + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.ui.guideStep.set(Math.max(0, g - 1));
      else return;
      e.preventDefault();
      return;
    }
    if (!mod && !this.is3d() && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0')) {
      this.ui.zoom(e.key === '0' ? 'fit' : e.key === '-' ? 'out' : 'in');
      return;
    }
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.store.redo();
      else this.store.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.store.redo();
      return;
    }
    if (e.key === 'Escape') {
      if (this.ui.menu()) this.ui.menu.set(null);
      else if (this.sg.previewId()) this.sg.cancel();
      else this.store.select(null);
      return;
    }
    const z = this.store.selected();
    if (!z) return;
    if (mod && key === 'd') {
      e.preventDefault();
      this.store.duplicateSelected();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.store.deleteSelected();
      return;
    }
    const st = e.shiftKey ? 10 : 1;
    const mv: Record<string, [number, number]> = {
      ArrowLeft: [-st, 0],
      ArrowRight: [st, 0],
      ArrowUp: [0, -st],
      ArrowDown: [0, st],
    };
    const d = mv[e.key];
    if (d) {
      e.preventDefault();
      this.store.patchZone(z.id, { x: z.x + d[0], y: z.y + d[1] });
      // une rafale de flèches = une seule entrée d'historique
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = window.setTimeout(() => this.store.commit(), 400);
    }
  }
}
