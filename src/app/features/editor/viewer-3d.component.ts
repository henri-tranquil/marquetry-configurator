import { afterNextRender, ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { SceneService } from '../../render/three/scene.service';
import { ProjectStore } from '../../state/project.store';
import { ViewCommands } from '../../state/view-commands';

/** Vue 3D : simple hôte du SceneService (fourni ici, donc détruit avec la vue). */
@Component({
  selector: 'app-viewer-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SceneService],
  template: `
    <canvas #cv aria-label="Vue 3D du panneau"></canvas>
    @if (scene.status() === 'error') {
      <p class="msg" role="alert">La vue 3D a besoin de WebGL, indisponible dans ce navigateur.</p>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; }
    canvas:active { cursor: grabbing; }
    .msg { position: absolute; inset: auto 16px 16px; margin: 0; padding: 12px 14px; border-radius: 8px; background: rgba(0, 0, 0, 0.45); color: #fff; }
  `,
})
export class Viewer3dComponent {
  protected readonly scene = inject(SceneService);
  private readonly store = inject(ProjectStore);
  private readonly commands = inject(ViewCommands);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');

  constructor() {
    afterNextRender(() => this.scene.attach(this.canvas().nativeElement));
    let lastFront = this.commands.frontView();
    effect(() => {
      const n = this.commands.frontView();
      if (n !== lastFront) {
        lastFront = n;
        this.scene.resetCamera();
      }
    });
    effect(() => {
      this.scene.update({
        project: this.store.project(),
        prepared: this.store.prepared(),
        selected: this.store.selected(),
      });
    });
  }
}
