import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { AddKind } from '../../core/model/operations';
import { PANEL_PRESETS, ViewMode } from '../../core/model/project';
import { fmt } from '../../shared/format';
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
import { StageCanvasComponent } from './stage-canvas.component';
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
    StageCanvasComponent,
    Viewer3dComponent,
    InspectorComponent,
    LightPanelComponent,
    EdgesPanelComponent,
    PatternsPanelComponent,
    LayersPanelComponent,
    BomPanelComponent,
    ExportPanelComponent,
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
  protected readonly holes: Tool[] = [
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

  protected frontView(): void {
    this.commands.requestFrontView();
  }

  /** Raccourcis clavier, ignorés quand le focus est dans un champ. */
  protected onKey(e: KeyboardEvent): void {
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest('input, textarea, select, [contenteditable]') || t.closest('dialog'))) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
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
      this.store.select(null);
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
