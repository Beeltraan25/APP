import type { Entorno } from "../entorno";
import type { Precio } from "../esquemas/producto";
import { Errores } from "../infra/errores";
import { detectarMoneda, parsearImporte } from "./precios";

/** Un resultado de SerpAPI ya leído, antes de filtrarlo por la lista blanca. */
export interface Candidato {
  fuente: "lens" | "shopping";
  posicion: number;
  titulo: string;
  /** Lens: página del producto en la tienda. Shopping: página de Google Shopping (no da la de la tienda). */
  url: string;
  /** Nombre del vendedor ("source"). */
  nombreTienda: string | null;
  imagen: string | null;
  /** Imagen pequeña (miniatura de Google): sirve para comparar fotos sin gastar CPU. */
  miniatura: string | null;
  precio: Precio | null;
  precioAnterior: Precio | null;
}

/** Una imagen de referencia de un estilo (Google Images). */
export interface Referencia {
  imagen: string;
  titulo: string | null;
  fuente: string | null;
  /** Página de la imagen (p. ej. el pin de Pinterest). */
  enlace?: string | null;
}

export interface OpcionesShopping {
  ordenarPorPrecio?: boolean;
}

export interface ClienteSerpapi {
  /** Google Lens: búsqueda por imagen. La imagen debe estar en una URL pública. */
  lens(urlImagen: string): Promise<Candidato[]>;
  /**
   * Google Shopping: búsqueda por texto en España. Con `ordenarPorPrecio`, de más barato a más caro.
   * (No se usa el precio máximo de Google: con él apenas devuelve 2 o 3 resultados.)
   */
  shopping(consulta: string, opciones?: OpcionesShopping): Promise<Candidato[]>;
  /** Google Images: referencias visuales de un estilo. */
  imagenes(consulta: string): Promise<Referencia[]>;
}

/**
 * Solo los campos que se usan: las respuestas completas de Shopping pesan ~400 KB y leerlas
 * podría pasar del límite gratuito de CPU de Cloudflare (10 ms por petición).
 */
const CAMPOS_SHOPPING =
  "error, shopping_results[].{position,title,source,price,extracted_price,old_price,extracted_old_price,link,product_link,thumbnail,serpapi_thumbnail,second_hand_condition}";
const CAMPOS_IMAGENES = "error, images_results[0:15].{thumbnail,title,source,link}";

export function crearClienteSerpapi(entorno: Entorno, f: typeof fetch = fetch): ClienteSerpapi {
  const apiKey = entorno.SERPAPI_KEY;
  if (!apiKey) throw Errores.servidorNoConfigurado("SERPAPI_KEY");

  const pedir = async (parametros: Record<string, string>) => {
    const url = new URL("https://serpapi.com/search.json");
    for (const [clave, valor] of Object.entries({ ...parametros, api_key: apiKey })) url.searchParams.set(clave, valor);

    let respuesta: Response;
    try {
      respuesta = await f(url.toString(), { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw Errores.busquedaNoDisponible(error instanceof Error ? error.message : String(error));
    }
    return comprobarRespuesta(respuesta.status, await respuesta.json().catch(() => null));
  };

  return {
    async lens(urlImagen) {
      return leerLens(await pedir({ engine: "google_lens", url: urlImagen, country: "es", hl: "es" }));
    },
    async shopping(consulta, opciones) {
      const parametros: Record<string, string> = {
        engine: "google_shopping",
        q: consulta,
        gl: "es",
        hl: "es",
        google_domain: "google.es",
        json_restrictor: CAMPOS_SHOPPING,
      };
      if (opciones?.ordenarPorPrecio) parametros.sort_by = "1";
      return leerShopping(await pedir(parametros));
    },
    async imagenes(consulta) {
      return leerImagenes(
        await pedir({ engine: "google_images", q: consulta, gl: "es", hl: "es", json_restrictor: CAMPOS_IMAGENES }),
      );
    },
  };
}

type Objeto = Record<string, unknown>;
const esObjeto = (valor: unknown): valor is Objeto => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/** SerpAPI responde los errores como { "error": "…" }, a veces con HTTP 200. */
export function comprobarRespuesta(estado: number, datos: unknown): Objeto {
  if (!esObjeto(datos)) throw Errores.busquedaNoDisponible(`HTTP ${estado} sin JSON`);
  const error = texto(datos.error);
  if (error) {
    // "Google hasn't returned any results for this query." no es un fallo: simplemente no hay resultados.
    if (/returned any results|no results/i.test(error)) return {};
    if (estado === 429 || /run out of searches|searches per|limit/i.test(error)) throw Errores.cuotaBusquedas();
    if (/invalid api key/i.test(error)) throw Errores.servidorNoConfigurado("una SERPAPI_KEY válida");
    throw Errores.busquedaNoDisponible(error);
  }
  if (estado < 200 || estado >= 300) throw Errores.busquedaNoDisponible(`HTTP ${estado}`);
  return datos;
}

/** Resultados de Google Lens. El precio puede venir como objeto { value, extracted_value, currency } o como texto. */
export function leerLens(datos: Objeto): Candidato[] {
  const listas = ["visual_matches", "exact_matches", "products"].flatMap((clave) =>
    Array.isArray(datos[clave]) ? (datos[clave] as unknown[]) : [],
  );
  return listas.filter(esObjeto).flatMap((item, indice) => {
    const titulo = texto(item.title);
    const url = texto(item.link);
    // in_stock solo aparece a veces; si dice que está agotado, no sirve.
    if (!titulo || !url || item.in_stock === false) return [];
    return [
      {
        fuente: "lens" as const,
        posicion: typeof item.position === "number" ? item.position : indice + 1,
        titulo,
        url,
        nombreTienda: texto(item.source),
        imagen: texto(item.image) ?? texto(item.thumbnail),
        miniatura: texto(item.thumbnail) ?? texto(item.image),
        precio: leerPrecio(item.price, item.extracted_price),
        precioAnterior: leerPrecio(item.old_price, item.extracted_old_price),
      },
    ];
  });
}

/** Resultados de Google Shopping. No incluyen la URL de la tienda: se usa product_link (Google Shopping). */
export function leerShopping(datos: Objeto): Candidato[] {
  const lista = Array.isArray(datos.shopping_results) ? (datos.shopping_results as unknown[]) : [];
  return lista.filter(esObjeto).flatMap((item, indice) => {
    const titulo = texto(item.title);
    // "link" llega como texto vacío: se usa product_link.
    const url = texto(item.link) ?? texto(item.product_link);
    // Las prendas de segunda mano ("usado") no son alternativas que se puedan comprar nuevas.
    if (!titulo || !url || item.second_hand_condition) return [];
    return [
      {
        fuente: "shopping" as const,
        posicion: typeof item.position === "number" ? item.position : indice + 1,
        titulo,
        url,
        nombreTienda: texto(item.source),
        imagen: texto(item.thumbnail) ?? texto(item.serpapi_thumbnail),
        miniatura: texto(item.thumbnail) ?? texto(item.serpapi_thumbnail),
        precio: leerPrecio(item.price, item.extracted_price),
        precioAnterior: leerPrecio(item.old_price, item.extracted_old_price),
      },
    ];
  });
}

/** Resultados de Google Images: solo los que tienen miniatura https. */
export function leerImagenes(datos: Objeto): Referencia[] {
  const lista = Array.isArray(datos.images_results) ? (datos.images_results as unknown[]) : [];
  return lista.filter(esObjeto).flatMap((item) => {
    const imagen = texto(item.thumbnail);
    if (!imagen?.startsWith("https://")) return [];
    const enlace = texto(item.link);
    return [{ imagen, titulo: texto(item.title), fuente: texto(item.source), enlace: enlace?.startsWith("https://") ? enlace : null }];
  });
}

/** Admite "29,95 €" + 29.95, o { value: "29,95 €", extracted_value: 29.95, currency: "€" }. */
export function leerPrecio(valor: unknown, extraido?: unknown): Precio | null {
  let textoPrecio: string | null = null;
  let numero: number | null = typeof extraido === "number" ? extraido : null;
  let moneda: string | null = null;

  if (esObjeto(valor)) {
    textoPrecio = texto(valor.value);
    if (typeof valor.extracted_value === "number") numero = valor.extracted_value;
    moneda = detectarMoneda(`${texto(valor.currency) ?? ""} ${textoPrecio ?? ""}`);
  } else {
    textoPrecio = texto(valor);
    moneda = textoPrecio ? detectarMoneda(textoPrecio) : null;
  }

  const centimos = numero !== null ? Math.round(numero * 100) : textoPrecio ? parsearImporte(textoPrecio) : null;
  if (centimos === null || centimos <= 0 || !moneda) return null;
  return { centimos, moneda };
}
