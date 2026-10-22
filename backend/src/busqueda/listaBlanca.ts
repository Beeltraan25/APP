import tiendasJson from "../../config/tiendas.json";

export interface TiendaConfig {
  id: string;
  nombre: string;
  grupo: string;
  dominios: string[];
  /** false = está en la lista pero no se usa (p. ej. tiendas solo de mujer mientras la app sea de hombre). */
  activa: boolean;
  /** Vende otras marcas (Zalando, ASOS, El Corte Inglés). */
  multimarca?: boolean;
  /** Otros nombres con los que aparece en Google Shopping ("Zalando.es", "Pull & Bear"…). */
  alias?: string[];
}

export const TIENDAS: readonly TiendaConfig[] = tiendasJson;

/** Dominio sin "www.", en minúsculas. */
export function dominioDeUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Tienda de la lista blanca a la que pertenece una URL (por dominio y subdominios), o null. */
export function tiendaDeUrl(url: string, { soloActivas = false } = {}): TiendaConfig | null {
  const dominio = dominioDeUrl(url);
  if (!dominio) return null;
  return (
    TIENDAS.find(
      (tienda) =>
        (!soloActivas || tienda.activa) &&
        tienda.dominios.some((d) => dominio === d || dominio.endsWith(`.${d}`)),
    ) ?? null
  );
}

/** "El Corte Inglés" → "elcorteingles" (sin tildes, espacios ni símbolos). */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const nombresPorTienda = new Map(
  TIENDAS.map((tienda) => [
    tienda,
    new Set(
      [
        tienda.nombre,
        ...(tienda.alias ?? []),
        ...tienda.dominios,
        ...tienda.dominios.map((d) => d.split(".")[0] ?? d),
      ].map(normalizarNombre),
    ),
  ]),
);

/** Nombres normalizados con los que puede aparecer una tienda. */
export function nombresDe(tienda: TiendaConfig): ReadonlySet<string> {
  return nombresPorTienda.get(tienda) ?? new Set();
}

/**
 * Tienda a partir del nombre del vendedor ("source" de Google Shopping), que no da la URL de la tienda.
 * Coincidencia exacta tras normalizar: "Mango Outlet" no es "Mango".
 */
export function tiendaDeNombre(nombre: string, { soloActivas = false } = {}): TiendaConfig | null {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return null;
  return TIENDAS.find((tienda) => (!soloActivas || tienda.activa) && nombresPorTienda.get(tienda)?.has(buscado)) ?? null;
}

export function tiendasActivas() {
  return TIENDAS.filter((tienda) => tienda.activa);
}
