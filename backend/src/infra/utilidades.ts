/** Huella SHA-256 en hexadecimal (para ids y claves de caché). */
export async function sha256Hex(datos: Uint8Array | string): Promise<string> {
  const bytes = typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  const huella = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(huella), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Convierte bytes a base64 por bloques con btoa: rápido y sin depender de Node. */
export function aBase64(bytes: Uint8Array): string {
  const BLOQUE = 0x8000;
  let binario = "";
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + BLOQUE));
  }
  return btoa(binario);
}

/** Parámetros de seguimiento que no cambian el producto y se quitan de las URLs. */
const PARAMETROS_SEGUIMIENTO = /^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|ref|referrer)$/i;

/**
 * Normaliza la URL de un producto: quita el fragmento y los parámetros de seguimiento y
 * ordena el resto. Se conservan los demás parámetros porque algunas tiendas indican el
 * color con ellos (p. ej. Zara con ?v1=).
 */
export function limpiarUrl(texto: string): string {
  const url = new URL(texto);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const conservados = [...url.searchParams.entries()]
    .filter(([clave]) => !PARAMETROS_SEGUIMIENTO.test(clave))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(conservados).toString();
  return url.toString();
}

/** Texto sin espacios sobrantes, o null si queda vacío. */
export function textoONull(texto: string | null | undefined): string | null {
  const limpio = texto?.replace(/\s+/g, " ").trim();
  return limpio ? limpio : null;
}
