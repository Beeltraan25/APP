/** Bindings y secretos del Worker (ver wrangler.jsonc y .dev.vars). */
export interface Entorno {
  /** Caché de respuestas (24 h). */
  CACHE: KVNamespace;
  /** Fotos subidas desde la app, guardadas 24 h para que Google Lens pueda leerlas. */
  IMAGENES: KVNamespace;
  /** Límite de peticiones de Cloudflare. Opcional: si no existe, se usa uno en memoria. */
  LIMITADOR?: RateLimit;

  /** Secreto: clave de la API de Gemini. */
  GEMINI_API_KEY?: string;
  /** Secreto: clave de SerpAPI (Google Lens y Google Shopping). */
  SERPAPI_KEY?: string;
  /** Secreto: clave compartida entre la app y el backend. */
  CLAVE_APP?: string;
  /** Modelos de Gemini separados por comas, en orden de preferencia. */
  GEMINI_MODELOS?: string;
}

export type ContextoApp = { Bindings: Entorno };
