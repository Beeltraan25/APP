import { TTL_24_HORAS } from "./cache";

export const TAMANO_MAXIMO_IMAGEN = 4 * 1024 * 1024;

export type TipoImagen = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";

/**
 * Detecta el formato por los primeros bytes del archivo (más fiable que el tipo declarado).
 * Solo admite los formatos que entiende Gemini.
 */
export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  const ascii = (desde: number, hasta: number) => String.fromCharCode(...bytes.subarray(desde, hasta));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const marca = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(marca)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(marca)) return "image/heif";
  }
  return null;
}

/** Guarda una foto 24 h. Devuelve false si no se pudo (p. ej. límite diario de escrituras). */
export async function guardarImagen(kv: KVNamespace, id: string, bytes: Uint8Array, tipo: TipoImagen) {
  try {
    await kv.put(id, bytes, { expirationTtl: TTL_24_HORAS, metadata: { tipo } });
    return true;
  } catch (error) {
    console.warn("No se pudo guardar la imagen", error);
    return false;
  }
}

export async function leerImagen(kv: KVNamespace, id: string) {
  const { value, metadata } = await kv.getWithMetadata<{ tipo: TipoImagen }>(id, "arrayBuffer");
  if (!value) return null;
  return { bytes: value, tipo: metadata?.tipo ?? "image/jpeg" };
}

/**
 * Descarga la imagen de un producto (p. ej. la og:image de la tienda) para enviársela a la IA.
 * Devuelve null si no se puede: el análisis seguirá solo con el texto.
 */
export async function descargarImagen(url: string, f: typeof fetch = fetch) {
  try {
    const respuesta = await f(url, {
      headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" },
      signal: AbortSignal.timeout(8000),
    });
    if (!respuesta.ok) return null;
    const longitud = Number(respuesta.headers.get("Content-Length") ?? 0);
    if (longitud > TAMANO_MAXIMO_IMAGEN) return null;
    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    if (bytes.length === 0 || bytes.length > TAMANO_MAXIMO_IMAGEN) return null;
    const tipo = detectarTipoImagen(bytes);
    return tipo ? { bytes, tipo } : null;
  } catch {
    return null;
  }
}

/** La misma imagen convertida a JPEG por wsrv.nl (gratis, sin clave). */
export function urlEnJpeg(url: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&w=384&q=80`;
}

/**
 * Imagen de una candidata para compararla con la original, reducida a JPEG de 384 px: los
 * embeddings solo admiten JPEG y PNG (Google Shopping da WebP) y las fotos grandes de las tiendas
 * pesan mucho. Si la conversión falla, la original.
 */
export async function descargarMiniatura(url: string, f: typeof fetch = fetch) {
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) return null;
  } catch {
    return null;
  }
  return (await descargarImagen(urlEnJpeg(url), f)) ?? descargarImagen(url, f);
}
