/** Types du domaine. Longueurs en mm, angles en degrés, repère panneau (y vers le bas). */

export const STRAW_COLORS = [
  'naturel',
  'ble',
  'miel',
  'brule',
  'ebene',
  'garance',
  'indigo',
  'sauge',
  'rose',
] as const;
export type StrawColor = (typeof STRAW_COLORS)[number];

export const SHAPE_TYPES = ['rect', 'ellipse', 'tri', 'diamond', 'hex', 'poly'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

export const PROFILE_TYPES = ['droit', 'chanfrein', 'arrondi'] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];

export type ViewMode = 'rendu' | 'plan' | '3d';
export type BgMode = 'paille' | 'bois';

export type Point = [number, number];

export interface EdgeProfile {
  type: ProfileType;
  size: number;
}

export interface Zone {
  id: number;
  type: ShapeType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  pts?: Point[];
  color: StrawColor;
  angle: number;
  hole: boolean;
  edge?: EdgeProfile;
}

export interface Project {
  panel: { w: number; h: number };
  thick: number;
  edge: EdgeProfile;
  bg: { mode: BgMode; color: StrawColor; angle: number };
  sw: number;
  irr: number;
  light: number;
  elev: number;
  contrast: number;
  gloss: number;
  view: ViewMode;
  zones: Zone[];
}

export interface StrawInfo {
  label: string;
  hex: string;
}

export const PALETTE: Readonly<Record<StrawColor, StrawInfo>> = {
  naturel: { label: 'Naturel', hex: '#d6b25c' },
  ble: { label: 'Blé clair', hex: '#ead592' },
  miel: { label: 'Miel', hex: '#c58e3c' },
  brule: { label: 'Brûlé', hex: '#86592c' },
  ebene: { label: 'Ébène', hex: '#2e2723' },
  garance: { label: 'Rouge garance', hex: '#9c3027' },
  indigo: { label: 'Bleu indigo', hex: '#2f4a7a' },
  sauge: { label: 'Vert sauge', hex: '#6e8a56' },
  rose: { label: 'Vieux rose', hex: '#c4867f' },
};

/** Couleur du médium nu (fond « bois » et parois). */
export const WOOD_HEX = '#a57f55';

export const PROFILE_LABELS: Readonly<Record<ProfileType, string>> = {
  droit: 'Droit',
  chanfrein: 'Chanfrein',
  arrondi: 'Arrondi',
};

export const SHAPE_NAMES: Readonly<Record<ShapeType, string>> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  tri: 'Triangle',
  diamond: 'Losange',
  hex: 'Hexagone',
  poly: 'Secteur',
};

export interface PanelPreset {
  label: string;
  w: number;
  h: number;
}

export const PANEL_PRESETS: readonly PanelPreset[] = [
  { label: 'Sous-bock', w: 100, h: 100 },
  { label: 'Façade de tiroir', w: 450, h: 150 },
  { label: 'Porte de buffet', w: 400, h: 700 },
  { label: 'Couvercle de boîte', w: 220, h: 140 },
  { label: 'Plateau de table basse', w: 1000, h: 550 },
  { label: 'Porte intérieure', w: 830, h: 2040 },
];

/** Bornes partagées par la normalisation et l'interface. */
export const LIMITS = {
  panel: [20, 5000],
  thick: [3, 60],
  sw: [1, 20],
  irr: [0, 1],
  light: [0, 359],
  elev: [5, 85],
  contrast: [0, 1],
  gloss: [0, 1],
  profileSize: [0.5, 40],
  angle: [0, 179],
  nameLength: 40,
  maxZones: 1500,
  maxPolyPoints: 300,
} as const;

export const STORAGE_KEY = 'atelier-paille-v1';

/** Longueur utile d'un brin : une coupe transversale environ tous les SEGMENT mm. */
export const STRAW_SEGMENT = 140;
