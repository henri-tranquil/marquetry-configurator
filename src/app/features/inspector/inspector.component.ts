import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { isNarrow, normAngle, profileRadius, round05 } from '../../core/geometry/geometry';
import { LIMITS, PALETTE, PROFILE_LABELS, PROFILE_TYPES, ProfileType, StrawColor, Zone } from '../../core/model/project';
import { fmt } from '../../shared/format';
import { NumberFieldComponent } from '../../shared/ui/number-field.component';
import { SegmentedComponent, SegOption } from '../../shared/ui/segmented.component';
import { SliderFieldComponent } from '../../shared/ui/slider-field.component';
import { SwatchesComponent } from '../../shared/ui/swatches.component';
import { ProjectStore } from '../../state/project.store';

@Component({
  selector: 'app-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwatchesComponent, SliderFieldComponent, SegmentedComponent, NumberFieldComponent],
  templateUrl: './inspector.component.html',
  styles: `
    .angles { margin-top: 6px; }
    .actions { margin-top: 12px; }
  `,
})
export class InspectorComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly zone = this.store.selected;
  protected readonly palette = PALETTE;
  protected readonly limits = LIMITS;
  protected readonly quickAngles = [0, 45, 90, 135];
  protected readonly profiles: SegOption<ProfileType>[] = PROFILE_TYPES.map((v) => ({ value: v, label: PROFILE_LABELS[v] }));
  protected readonly fmt = fmt;
  protected readonly round05 = round05;
  protected readonly round = Math.round;

  protected readonly warning = computed(() => {
    const z = this.zone();
    const p = this.store.project();
    if (!z) return '';
    if (z.hole && z.edge && z.edge.type !== 'droit') {
      const r = profileRadius(z.edge, p.thick);
      return (
        `Le perçage garde sa cote ; en façade, le profil élargit l'ouverture de ${fmt(r, 1)} mm tout autour.` +
        (z.edge.size > p.thick - 0.5 ? " Profil limité par l'épaisseur du panneau." : '')
      );
    }
    if (isNarrow(z, p.sw)) return `Moins de 3 brins de large (${fmt(p.sw, 1)} mm par brin) : délicat à poser proprement.`;
    if (z.type === 'poly') return 'Secteur généré : il déborde du panneau, seule la partie visible compte.';
    return '';
  });

  protected live(z: Zone, patch: Partial<Zone>): void {
    this.store.patchZone(z.id, patch);
  }

  protected commit(): void {
    this.store.commit();
  }

  protected set(z: Zone, patch: Partial<Zone>): void {
    this.store.patchZone(z.id, patch);
    this.store.commit();
  }

  protected setName(z: Zone, v: string): void {
    this.live(z, { name: v.slice(0, LIMITS.nameLength) });
  }

  protected setColor(z: Zone, c: StrawColor): void {
    this.set(z, { color: c });
  }

  protected setHole(z: Zone, hole: boolean): void {
    this.set(z, { hole, edge: hole ? (z.edge ?? { type: 'droit', size: 5 }) : z.edge });
  }

  protected setProfile(z: Zone, type: ProfileType): void {
    this.set(z, { edge: { type, size: z.edge?.size ?? 5 } });
  }

  protected setProfileSize(z: Zone, v: number): void {
    if (v > 0) this.live(z, { edge: { type: z.edge?.type ?? 'droit', size: Math.min(LIMITS.profileSize[1], v) } });
  }

  protected setAngle(z: Zone, v: number): void {
    this.live(z, { angle: normAngle(v) });
  }
}
