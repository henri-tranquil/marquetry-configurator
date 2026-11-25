import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { clamp, profileRadius } from '../../core/geometry/geometry';
import { LIMITS, PROFILE_LABELS, PROFILE_TYPES, ProfileType } from '../../core/model/project';
import { fmt } from '../../shared/format';
import { NumberFieldComponent } from '../../shared/ui/number-field.component';
import { SegmentedComponent, SegOption } from '../../shared/ui/segmented.component';
import { ProjectStore } from '../../state/project.store';

@Component({
  selector: 'app-edges-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumberFieldComponent, SegmentedComponent],
  template: `
    <div class="g2 top">
      <app-number-field
        label="Épaisseur"
        [value]="p().thick"
        [min]="limits.thick[0]"
        [max]="limits.thick[1]"
        (committed)="setThick($event)"
      />
      @if (p().edge.type !== 'droit') {
        <app-number-field
          label="Taille du profil"
          [value]="p().edge.size"
          [min]="limits.profileSize[0]"
          [max]="limits.profileSize[1]"
          [step]="0.5"
          (live)="setSize($event)"
          (committed)="store.commit()"
        />
      }
    </div>
    <div class="lab">
      <span>Profil du chant du panneau</span>
      <output>{{ effective() }}</output>
    </div>
    <app-segmented label="Profil du chant" [options]="profiles" [value]="p().edge.type" (picked)="setType($event)" />
    <p class="note">
      La paille suit l'arrondi ou le chanfrein, le reste du chant reste en médium. Le profil d'un trou se règle
      en sélectionnant le trou. Visible en vue 3D, en pointillés gris sur le plan.
    </p>
  `,
  styles: `.top { margin-top: 0; }`,
})
export class EdgesPanelComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly p = this.store.project;
  protected readonly limits = LIMITS;
  protected readonly profiles: SegOption<ProfileType>[] = PROFILE_TYPES.map((v) => ({ value: v, label: PROFILE_LABELS[v] }));
  protected readonly effective = computed(() => {
    const p = this.p();
    return p.edge.type === 'droit' ? '' : `${fmt(profileRadius(p.edge, p.thick), 1)} mm`;
  });

  protected setThick(v: number): void {
    if (!Number.isFinite(v)) return;
    this.store.apply((p) => ({ ...p, thick: clamp(v, ...LIMITS.thick) }));
  }

  protected setSize(v: number): void {
    if (v <= 0) return;
    this.store.update((p) => ({ ...p, edge: { ...p.edge, size: Math.min(LIMITS.profileSize[1], v) } }));
  }

  protected setType(type: ProfileType): void {
    this.store.apply((p) => ({ ...p, edge: { ...p.edge, type } }));
  }
}
