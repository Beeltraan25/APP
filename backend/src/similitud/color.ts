/** Color en el espacio CIELAB (iluminante D65). */
export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** "#4A4A4A" → Lab. Null si el texto no es un color. */
export function hexALab(hex: string): Lab | null {
  const coincidencia = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!coincidencia?.[1]) return null;
  const valor = Number.parseInt(coincidencia[1], 16);
  const [r, g, b] = [(valor >> 16) & 0xff, (valor >> 8) & 0xff, valor & 0xff].map((canal) => {
    const c = canal / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  // sRGB lineal → XYZ (D65), normalizado por el blanco de referencia.
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const rad = (grados: number) => (grados * Math.PI) / 180;
const grados = (radianes: number) => (radianes * 180) / Math.PI;

/**
 * Diferencia de color CIEDE2000 (Sharma, Wu y Dalal, 2005).
 * Orientativo: < 2 no se nota · 2–10 se nota de cerca · > 25 son colores distintos.
 */
export function deltaE2000(color1: Lab, color2: Lab): number {
  const { L: L1, a: a1, b: b1 } = color1;
  const { L: L2, a: a2, b: b2 } = color2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cmedia = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cmedia ** 7 / (Cmedia ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : (grados(Math.atan2(b1, a1p)) + 360) % 360;
  const h2p = C2p === 0 ? 0 : (grados(Math.atan2(b2, a2p)) + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hpm - 30)) +
    0.24 * Math.cos(rad(2 * hpm)) +
    0.32 * Math.cos(rad(3 * hpm + 6)) -
    0.2 * Math.cos(rad(4 * hpm - 63));
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** ΔE ≤ 2 → 100; cada punto de diferencia más resta 3 (ΔE 12 → 70, ΔE 35 → 1). */
export function puntuacionColor(deltaE: number): number {
  return Math.round(Math.min(100, Math.max(0, 100 - (deltaE - 2) * 3)));
}
