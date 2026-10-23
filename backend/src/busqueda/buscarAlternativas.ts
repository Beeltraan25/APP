import type { Alternativa } from "../esquemas/busqueda";
import type { FichaPrenda } from "../esquemas/ficha";
import type { Producto, RangoPrecio } from "../esquemas/producto";
import { guardarCache, leerCache } from "../infra/cache";
import { ErrorApp } from "../infra/errores";
import { limpiarUrl, sha256Hex } from "../infra/utilidades";
import { nombresDe, normalizarNombre, tiendaDeNombre, tiendaDeUrl, type TiendaConfig } from "./listaBlanca";
import { rangoDePrecio } from "./precios";
import type { Candidato, ClienteSerpapi } from "./serpapi";

/** Máximo de alternativas: todas se puntúan, y cada una gasta una descarga de miniatura. */
export const MAXIMO_ALTERNATIVAS = 24;
/** Como mucho estas de Google Lens: el resto del hueco es para Shopping, que busca con el color. */
export const MAXIMO_LENS = 16;

/**
 * Google Lens guardado 24 h por imagen: el análisis de la foto y la búsqueda posterior usan la
 * misma imagen, así que la segunda vez no gasta otra consulta de SerpAPI.
 */
export async function lensConCache(serpapi: ClienteSerpapi, urlImagen: string, cache?: KVNamespace) {
  const clave = `lens:${await sha256Hex(urlImagen)}`;
  if (cache) {
    const guardado = await leerCache<Candidato[]>(cache, clave);
    if (guardado) return { candidatos: guardado, gastada: false };
  }
  const candidatos = await serpapi.lens(urlImagen);
  // Vacío no se guarda: justo después de subir la foto, Lens a veces aún no puede leerla.
  if (cache && candidatos.length) await guardarCache(cache, clave, candidatos);
  return { candidatos, gastada: true };
}

export interface ResultadoBusqueda {
  alternativas: Alternativa[];
  /** Miniatura de cada alternativa (mismo orden), para la similitud visual. */
  miniaturas: (string | null)[];
  /** Consultas de SerpAPI gastadas (el plan gratuito da ~250 al mes). */
  consultas: number;
}

/**
 * 1. Google Lens con la imagen (si es pública): lo más parecido a la vista, de cualquier color.
 * 2. Google Shopping con las palabras clave y el color: más candidatas del color correcto.
 * 3. Solo tiendas activas de la lista blanca, ropa de hombre y precio en euros. Sin duplicados.
 * (Después, la evaluación deja solo las del mismo color.)
 */
export async function buscarAlternativas(
  serpapi: ClienteSerpapi,
  { imagenUrl, ficha, cache }: { imagenUrl: string | null; ficha: FichaPrenda; cache?: KVNamespace },
): Promise<ResultadoBusqueda> {
  const candidatos: Candidato[] = [];
  let consultas = 0;
  let fallo: ErrorApp | null = null;

  if (imagenUrl && esPublica(imagenUrl)) {
    try {
      const lens = await lensConCache(serpapi, imagenUrl, cache);
      if (lens.gastada) consultas++;
      candidatos.push(...lens.candidatos);
    } catch (error) {
      // Sin cuota no tiene sentido seguir; otros fallos se compensan con Shopping.
      if (!(error instanceof ErrorApp) || error.codigo === "CUOTA_BUSQUEDAS") throw error;
      fallo = error;
    }
  }

  try {
    consultas++;
    candidatos.push(...(await serpapi.shopping(consultaTexto(ficha))));
  } catch (error) {
    // Si Lens sí funcionó, se devuelve lo que haya; si fallaron las dos, el error.
    if (fallo || candidatos.length === 0) throw error;
  }

  const validos = repartir(deduplicar(filtrar(candidatos)));
  return {
    alternativas: await Promise.all(validos.map(aAlternativa)),
    miniaturas: validos.map(({ candidato }) => candidato.miniatura),
    consultas,
  };
}

/** Primera búsqueda propuesta por la IA, asegurando que lleva el color y pide ropa de hombre. */
export function consultaTexto(ficha: FichaPrenda): string {
  let consulta = ficha.palabras_clave_busqueda[0] ?? ficha.categoria;
  const color = ficha.color_principal.nombre.toLowerCase();
  // Basta con la palabra principal del color ("gris" en "gris marengo").
  const palabraColor = color.split(/\s+/)[0] ?? color;
  if (palabraColor && !consulta.toLowerCase().includes(palabraColor)) consulta = `${consulta} ${color}`;
  return /\bhombre\b/i.test(consulta) ? consulta : `${consulta} hombre`;
}

/** Hasta MAXIMO_LENS de Lens y el resto de Shopping (si hay), sin pasar de MAXIMO_ALTERNATIVAS. */
export function repartir(validos: Valido[]): Valido[] {
  const lens = validos.filter((v) => v.candidato.fuente === "lens");
  const shopping = validos.filter((v) => v.candidato.fuente === "shopping");
  const deLens = lens.slice(0, Math.max(MAXIMO_LENS, MAXIMO_ALTERNATIVAS - shopping.length));
  return [...deLens, ...shopping].slice(0, MAXIMO_ALTERNATIVAS);
}

/** Google Lens no puede leer imágenes en localhost (backend en local): mejor no gastar la consulta. */
export function esPublica(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return ["http:", "https:"].includes(protocol) && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])|\.local$/.test(hostname);
  } catch {
    return false;
  }
}

const SECCION_MUJER = /\b(mujer|mujeres|woman|women|womens|dama|señora|girls?|chica)\b/i;

/** Mientras la app sea solo de hombre, se descarta lo que esté claramente en una sección de mujer. */
export function esDeMujer(candidato: Candidato): boolean {
  return SECCION_MUJER.test(candidato.titulo) || SECCION_MUJER.test(candidato.url.replace(/[/_-]/g, " "));
}

export interface Valido {
  candidato: Candidato;
  tienda: TiendaConfig;
}

/** Tiendas activas de la lista blanca, ropa de hombre y precio en euros. */
export function filtrar(candidatos: Candidato[]): Valido[] {
  return candidatos.flatMap((candidato) => {
    // Lens da la URL de la tienda; Shopping solo su nombre.
    const tienda =
      (candidato.fuente === "lens" ? tiendaDeUrl(candidato.url, { soloActivas: true }) : null) ??
      (candidato.nombreTienda ? tiendaDeNombre(candidato.nombreTienda, { soloActivas: true }) : null);
    if (!tienda || esDeMujer(candidato)) return [];
    if (!candidato.precio || candidato.precio.moneda !== "EUR") return [];
    return [{ candidato, tienda }];
  });
}

/** Lens primero (son los más parecidos visualmente) y sin repetir la misma prenda. */
export function deduplicar(validos: Valido[]): Valido[] {
  const ordenados = [...validos].sort(
    (a, b) =>
      Number(a.candidato.fuente === "shopping") - Number(b.candidato.fuente === "shopping") ||
      a.candidato.posicion - b.candidato.posicion,
  );
  const vistos = new Set<string>();
  return ordenados.filter(({ candidato, tienda }) => {
    const claves = [
      urlComparable(candidato.url),
      `${tienda.id}|${normalizarNombre(candidato.titulo)}|${candidato.precio?.centimos}`,
    ];
    if (claves.some((clave) => vistos.has(clave))) return false;
    claves.forEach((clave) => vistos.add(clave));
    return true;
  });
}

function urlComparable(url: string) {
  try {
    return limpiarUrl(url);
  } catch {
    return url;
  }
}

/** Un resultado válido convertido en el Producto que recibe la app. */
export async function aProducto({ candidato, tienda }: Valido): Promise<Producto> {
  const precio = candidato.precio!;
  const anterior = candidato.precioAnterior;
  const imagen = candidato.imagen?.startsWith("https://") ? candidato.imagen : null;
  const rango: RangoPrecio = rangoDePrecio(precio.centimos);
  return {
    id: `prd_${(await sha256Hex(urlComparable(candidato.url))).slice(0, 16)}`,
    titulo: limpiarTitulo(candidato.titulo, tienda),
    tienda: { id: tienda.id, nombre: tienda.nombre },
    marca: tienda.multimarca ? null : tienda.nombre,
    url: candidato.url,
    imagen_url: imagen,
    precio,
    precio_anterior: anterior && anterior.moneda === precio.moneda && anterior.centimos > precio.centimos ? anterior : null,
    rango,
  };
}

async function aAlternativa(valido: Valido): Promise<Alternativa> {
  return { producto: await aProducto(valido), similitud: null, etiquetas: [], fuente: valido.candidato.fuente };
}

/**
 * Quita lo que sobra de los títulos reales: la tienda al final ("Jeans barrel | Pull&Bear España")
 * y la talla de Google Shopping ("…, Talla: 34x30, Blue denim").
 */
export function limpiarTitulo(titulo: string, tienda: TiendaConfig): string {
  const sinTalla = titulo.replace(/,?\s*Talla:\s*[^,]*/i, "");
  const partes = sinTalla.split(/\s+\|\s+/);
  const ultima = partes.length > 1 ? normalizarNombre(partes[partes.length - 1] ?? "") : "";
  if (ultima && [...nombresDe(tienda)].some((nombre) => ultima.includes(nombre))) partes.pop();
  const limpio = partes.join(" | ").replace(/\s{2,}/g, " ").trim();
  return limpio || titulo;
}

export function contarPorRango(alternativas: Alternativa[]): Record<RangoPrecio, number> {
  const conteo: Record<RangoPrecio, number> = { economico: 0, medio: 0, alto: 0, premium: 0 };
  for (const alternativa of alternativas) conteo[alternativa.producto.rango]++;
  return conteo;
}
