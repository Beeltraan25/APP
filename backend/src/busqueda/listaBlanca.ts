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

export function tiendasActivas() {
  return TIENDAS.filter((tienda) => tienda.activa);
}
