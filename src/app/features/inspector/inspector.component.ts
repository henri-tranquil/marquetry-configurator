import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { fillCenter, toZoneLocal } from '../../core/geometry/fill';
import { clamp, isNarrow, normAngle, profileRadius, round05 } from '../../core/geometry/geometry';
import {
  defaultFill,
  FILL_LABELS,
  FILL_TYPES,
  FillType,
  LIMITS,
  PALETTE,
  Point,
  PROFILE_LABELS,
  PROFILE_TYPES,
  ProfileType,
  SHAPE_NAMES,
  StrawColor,
  StrawFill,
  Zone,
} from '../../core/model/project';
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
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .kind { width: 22px; height: 22px; border-radius: 6px; background: var(--c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2); flex: none; }
    .kind.hole { background: transparent; box-shadow: inset 0 0 0 2px var(--acc); border-radius: 50%; }
    .title { font-weight: 600; }
    .pos { margin-left: auto; color: var(--mute); font-size: 13px; font-variant-numeric: tabular-nums; }
    .angles { margin-top: 6px; }
    .angles button { flex: 1; justify-content: center; padding: 0 6px; }
    .g2.geom { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 14px; }
    .actions button { justify-content: center; padding: 0 6px; font-size: 14px; }
  `,
})
export class InspectorComponent {
  protected readonly store = inject(ProjectStore);
  protected readonly zone = this.store.selected;
  protected readonly palette = PALETTE;
  protected readonly limits = LIMITS;
  protected readonly quickAngles = [0, 45, 90, 135];
  protected readonly profiles: SegOption<ProfileType>[] = PROFILE_TYPES.map((v) => ({ value: v, label: PROFILE_LABELS[v] }));
  protected readonly fills: SegOption<FillType>[] = FILL_TYPES.map((v) => ({ value: v, label: FILL_LABELS[v] }));
  /** Origines rapides, en coordonnées normalisées de la forme. */
  protected readonly origins = [
    { label: 'Centre', cx: 0, cy: 0 },
    { label: 'Bas', cx: 0, cy: 0.5 },
    { label: 'Haut', cx: 0, cy: -0.5 },
    { label: 'Gauche', cx: -0.5, cy: 0 },
    { label: 'Droite', cx: 0.5, cy: 0 },
  ];
  protected readonly kindLabel = computed(() => {
    const z = this.zone();
    if (!z) return '';
    if (z.hole) return z.type === 'ellipse' ? 'Trou rond' : 'Trou';
    return SHAPE_NAMES[z.type];
  });
  protected readonly layerNumber = computed(() => {
    const z = this.zone();
    return z ? this.store.project().zones.indexOf(z) + 1 : 0;
  });
  protected readonly fillType = computed<FillType>(() => this.zone()?.fill?.type ?? 'parallele');
  /** Origine en mm, repère panneau. */
  protected readonly center = computed<Point | null>(() => {
    const z = this.zone();
    return z ? fillCenter(z) : null;
  });
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

  protected setFill(z: Zone, type: FillType): void {
    this.set(z, { fill: defaultFill(type, z.fill) });
  }

  protected patchFill(z: Zone, patch: Partial<StrawFill>): void {
    this.live(z, { fill: { ...(z.fill ?? defaultFill('parallele')), ...patch } });
  }

  protected setBand(z: Zone, v: number): void {
    if (v > 0) this.patchFill(z, { band: clamp(v, ...LIMITS.chevronBand) });
  }

  protected setOrigin(z: Zone, cx: number, cy: number): void {
    this.patchFill(z, { cx, cy });
    this.commit();
  }

  /** Saisie de l'origine en mm (repère panneau), stockée en coordonnées de la forme. */
  protected setCenter(z: Zone, x: number | null, y: number | null): void {
    const c = fillCenter(z);
    const [cx, cy] = toZoneLocal(z, [x ?? c[0], y ?? c[1]]);
    this.patchFill(z, { cx: clamp(cx, ...LIMITS.fillCenter), cy: clamp(cy, ...LIMITS.fillCenter) });
  }

  protected setAngle(z: Zone, v: number): void {
    this.live(z, { angle: normAngle(v) });
  }
}
