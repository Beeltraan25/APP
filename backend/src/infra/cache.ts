/** Súbela cuando cambien los prompts o los esquemas: así se ignora la caché antigua. */
const VERSION = "v4";

export const TTL_24_HORAS = 60 * 60 * 24;

export async function leerCache<T>(kv: KVNamespace, clave: string): Promise<T | null> {
  try {
    return await kv.get<T>(`${VERSION}:${clave}`, "json");
  } catch (error) {
    console.warn("No se pudo leer la caché", error);
    return null;
  }
}

/** Si falla (p. ej. por el límite diario de escrituras de KV), la petición sigue adelante. */
export async function guardarCache(kv: KVNamespace, clave: string, valor: unknown, ttl = TTL_24_HORAS) {
  try {
    await kv.put(`${VERSION}:${clave}`, JSON.stringify(valor), { expirationTtl: ttl });
  } catch (error) {
    console.warn("No se pudo guardar en la caché", error);
  }
}
