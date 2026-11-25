const cache = new Map<number, Intl.NumberFormat>();

/** Nombre formaté en fr-FR avec `digits` décimales fixes. */
export function fmt(v: number, digits = 0): string {
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(digits, f);
  }
  return f.format(v);
}

/** Surface en mm² présentée en cm² ou dm². */
export function fmtArea(mm2: number): string {
  return mm2 >= 1e5 ? `${fmt(mm2 / 1e4, 2)} dm²` : `${fmt(mm2 / 100)} cm²`;
}
