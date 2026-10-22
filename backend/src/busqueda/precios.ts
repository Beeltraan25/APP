import type { Precio, RangoPrecio } from "../esquemas/producto";

/**
 * Convierte un importe escrito de cualquier forma habitual a céntimos:
 * "29,95" · "29.95" · "1.299,00" · "1,299.00" · "1.299" · "29" → céntimos enteros.
 */
export function parsearImporte(texto: string): number | null {
  // Grupos de cifras separados por "." o ","; el espacio solo cuenta como separador de miles ("1 299,00").
  const numero = texto.match(/\d+(?:[.,]\d+|\s\d{3}(?!\d))*/)?.[0].replace(/\s/g, "");
  if (!numero) return null;

  const ultimaComa = numero.lastIndexOf(",");
  const ultimoPunto = numero.lastIndexOf(".");
  let normalizado: string;

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Hay los dos: el que va último es el separador decimal.
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    normalizado = numero.split(miles).join("").replace(decimal, ".");
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    const separador = ultimaComa >= 0 ? "," : ".";
    const partes = numero.split(separador);
    const ultima = partes[partes.length - 1] ?? "";
    // Con un solo separador y 1–2 cifras detrás, es decimal ("29,95"); si no, de miles ("1.299").
    normalizado = partes.length === 2 && ultima.length <= 2 ? partes.join(".") : partes.join("");
  } else {
    normalizado = numero;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? Math.round(valor * 100) : null;
}

/** Moneda que aparece en el texto (código ISO), o null si no se indica. */
export function detectarMoneda(texto: string): string | null {
  if (/€|\beur\b|euros?/i.test(texto)) return "EUR";
  if (/\$|\busd\b/i.test(texto)) return "USD";
  if (/£|\bgbp\b/i.test(texto)) return "GBP";
  return null;
}

/**
 * Lee un precio como "29,95 €" o "EUR 1.299,00". Si el texto no dice la moneda, se usa
 * `monedaPorDefecto` (p. ej. la del JSON-LD de la tienda).
 */
export function parsearPrecio(texto: string, monedaPorDefecto: string | null = null): Precio | null {
  const centimos = parsearImporte(texto);
  const moneda = detectarMoneda(texto) ?? monedaPorDefecto;
  if (centimos === null || !moneda) return null;
  return { centimos, moneda: moneda.toUpperCase() };
}

/** "29,95 €" (formato español). */
export function formatearPrecio(precio: Precio): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: precio.moneda }).format(precio.centimos / 100);
}

/** Económico < 25 € · Medio 25–60 € · Alto más de 60 hasta 150 € · Premium más de 150 €. */
export function rangoDePrecio(centimos: number): RangoPrecio {
  if (centimos < 2500) return "economico";
  if (centimos <= 6000) return "medio";
  if (centimos <= 15000) return "alto";
  return "premium";
}
