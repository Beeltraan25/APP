import type { Alternativa } from "../esquemas/busqueda";
import type { FichaPrenda } from "../esquemas/ficha";
import type { ImagenEntrada, ParteEntrada, ProveedorIA } from "../ia/proveedor";
import { descargarImagen, descargarMiniatura, leerImagen, type TipoImagen } from "../infra/imagenes";
import { aBase64 } from "../infra/utilidades";
import {
  describirOriginal,
  esquemaAtributos,
  fibrasDeFicha,
  INSTRUCCIONES_ATRIBUTOS,
  normalizarFibra,
  puntuacionDetalles,
  puntuacionFit,
  puntuacionGramaje,
  puntuacionMaterial,
  type AtributosCandidata,
} from "./atributos";
import { deltaE2000, hexALab, puntuacionColor } from "./color";
import { combinar, crearEtiquetas } from "./puntuar";

type Imagen = { bytes: Uint8Array; tipo: TipoImagen };

/**
 * Coseno entre embeddings de imagen → 0–100. Calibrado con fotos reales (22/10/2026):
 * vaqueros casi iguales ≈ 0,85; misma prenda en otro color o corte ≈ 0,70; otra prenda ≈ 0,60.
 */
export const COSENO_MINIMO = 0.55;
export const COSENO_MAXIMO = 0.9;

export function puntuacionVisual(coseno: number): number {
  return Math.round(Math.min(1, Math.max(0, (coseno - COSENO_MINIMO) / (COSENO_MAXIMO - COSENO_MINIMO))) * 100);
}

export function coseno(a: number[], b: number[]): number {
  let producto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    producto += x * y;
    normaA += x * x;
    normaB += y * y;
  }
  return normaA && normaB ? producto / Math.sqrt(normaA * normaB) : 0;
}

/**
 * Cuánto tiene que parecerse una candidata (forma, corte y detalles, sin contar el color; 0–100,
 * según la IA) para enseñarla. De otro color se exige mucho: si no, «otra prenda azul cualquiera».
 */
export interface Exigencia {
  mismoColor: number;
  otroColor: number;
  /**
   * De otro color, además: puntuación de la forma (grosor, material, corte y detalles). Sin lo
   * visual: el parecido de la foto baja solo por ser de otro color.
   */
  otroColorForma: number;
  /** Proporción mínima de los detalles de la original que tiene que tener (0 = no se mira). */
  detallesMinimo: number;
  /** Quitar también las de otro tipo de prenda aunque sean del mismo color. */
  soloMismaPrenda: boolean;
}
export const EXIGENCIA_BUSQUEDA: Exigencia = { mismoColor: 35, otroColor: 70, otroColorForma: 65, detallesMinimo: 0, soloMismaPrenda: true };
/** Ideas de Pinterest: vienen de búsquedas de texto, más sueltas; se filtran más. */
export const EXIGENCIA_IDEAS: Exigencia = { mismoColor: 65, otroColor: 65, otroColorForma: 70, detallesMinimo: 20, soloMismaPrenda: true };

/** Sin atributos de la IA (no ha devuelto esa candidata), parecido visual mínimo para enseñarla. */
export const VISUAL_MINIMO_SIN_ATRIBUTOS = 50;

/** Si se enseña o no, según los atributos de la IA (sin ellos, se enseña). */
export function sePareceLoSuficiente(attrs: AtributosCandidata | null, exigencia: Exigencia): boolean {
  if (!attrs) return true;
  if (attrs.mismo_color === false) return attrs.misma_prenda && attrs.parecido >= exigencia.otroColor;
  if (exigencia.soloMismaPrenda && !attrs.misma_prenda) return false;
  return attrs.parecido >= exigencia.mismoColor;
}

/**
 * Lo que la IA no siempre ve: una de otro color solo vale si además tiene un corte igual o vecino, un grosor
 * parecido y su forma puntúa alto. Si no, es «otra prenda de otro color».
 */
export function otroColorBienParecida(
  puntuaciones: { fit: number | null; gramaje: number | null },
  forma: number | null,
  exigencia: Exigencia,
): boolean {
  // Corte igual o vecino (regular ↔ relajado); más lejos, ya es otra prenda.
  if (puntuaciones.fit !== null && puntuaciones.fit < 60) return false;
  if (puntuaciones.gramaje !== null && puntuaciones.gramaje === 0) return false;
  // Sin datos no hay forma de saber si se parece: fuera.
  return forma !== null && forma >= exigencia.otroColorForma;
}

export interface EntradaEvaluacion {
  ia: ProveedorIA;
  ficha: FichaPrenda;
  alternativas: Alternativa[];
  /** Miniatura de cada alternativa (mismo orden). */
  miniaturas: (string | null)[];
  /** URL de la imagen original (la de /v1/analizar). */
  imagenUrl: string | null;
  /** Para leer la foto original si está guardada en este backend. */
  kvImagenes: KVNamespace;
  fetchImagenes?: typeof fetch;
  /** Por defecto, la de la búsqueda normal. */
  exigencia?: Exigencia;
}

export interface ResultadoEvaluacion {
  alternativas: Alternativa[];
  /** Cuántas son de otro color (van al final). */
  deOtroColor: number;
  /** Cuántas se han quitado por parecerse poco. */
  descartadas: number;
}

/**
 * Puntúa cada alternativa (0–100) y le pone hasta 3 etiquetas. Primero las del mismo color que
 * la original (según la IA) y después las demás; dentro de cada grupo, de más a menos parecida.
 * Si la IA falla, se devuelven igualmente: sin el dato que falte (o sin similitud si no hay ninguno).
 */
export async function evaluarAlternativas(entrada: EntradaEvaluacion): Promise<ResultadoEvaluacion> {
  const { ia, ficha, alternativas } = entrada;
  if (!alternativas.length) return { alternativas, deOtroColor: 0, descartadas: 0 };
  const exigencia = entrada.exigencia ?? EXIGENCIA_BUSQUEDA;

  const [original, miniaturas] = await Promise.all([
    imagenOriginal(entrada),
    Promise.all(entrada.miniaturas.map((url) => (url ? descargarMiniatura(url, entrada.fetchImagenes) : Promise.resolve(null)))),
  ]);

  // Visual y atributos a la vez: son independientes.
  const [visuales, atributos] = await Promise.all([
    similitudesVisuales(ia, original, miniaturas).catch((error) => {
      console.warn("Similitud visual no disponible", error);
      return null;
    }),
    extraerAtributos(ia, ficha, alternativas, original, miniaturas).catch((error) => {
      console.warn("Atributos no disponibles", error);
      return null;
    }),
  ]);

  const labOriginal = hexALab(ficha.color_principal.hex);
  const fibrasOriginal = fibrasDeFicha(ficha);

  const pocoParecidas = new Set<number>();
  const evaluadas = alternativas.map((alternativa, indice) => {
    const attrs = atributos?.get(indice) ?? null;
    const labCandidata = attrs?.color ? hexALab(attrs.color.hex) : null;
    const deltaE = labOriginal && labCandidata ? deltaE2000(labOriginal, labCandidata) : null;
    const fibras = attrs?.fibras.map(normalizarFibra) ?? [];
    const visual = visuales?.[indice] ?? null;
    const mismaPrenda = attrs?.misma_prenda ?? true;

    const puntuaciones = {
      visual: visual === null ? null : puntuacionVisual(visual),
      color: deltaE === null ? null : puntuacionColor(deltaE),
      gramaje: puntuacionGramaje(ficha.gramaje_estimado, attrs?.gramaje_estimado ?? null),
      material: puntuacionMaterial(fibrasOriginal, fibras),
      fit: puntuacionFit(ficha.fit, attrs?.fit ?? null),
      detalles: attrs ? puntuacionDetalles(ficha.detalles, attrs.detalles_presentes) : null,
    };
    const similitud = combinar(puntuaciones, mismaPrenda);
    if (attrs?.mismo_color === false) {
      const forma = combinar({ ...puntuaciones, color: null, visual: null }, mismaPrenda)?.total ?? null;
      if (!otroColorBienParecida(puntuaciones, forma, exigencia)) pocoParecidas.add(indice);
    }
    // Sin datos de la IA, solo queda la foto: si se parece poco, fuera.
    if (!attrs && puntuaciones.visual !== null && puntuaciones.visual < VISUAL_MINIMO_SIN_ATRIBUTOS) pocoParecidas.add(indice);
    // Ideas de Pinterest: tienen que tener al menos parte de los detalles clave (bolsillos cargo, capucha…).
    if (exigencia.detallesMinimo && puntuaciones.detalles !== null && puntuaciones.detalles < exigencia.detallesMinimo) {
      pocoParecidas.add(indice);
    }

    const etiquetas = attrs
      ? crearEtiquetas(ficha, {
          mismaPrenda,
          deltaE,
          gramaje: attrs.gramaje_estimado,
          fit: attrs.fit,
          mismoMaterial: fibrasOriginal.length && fibras.length ? fibras.includes(fibrasOriginal[0] ?? "") : null,
          detallesPresentes: attrs.detalles_presentes,
        })
      : [];

    return { ...alternativa, similitud, etiquetas, mismo_color: attrs ? attrs.mismo_color : null };
  });

  const otroColor = (a: Alternativa) => (a.mismo_color === false ? 1 : 0);
  const ordenadas = evaluadas
    .map((alternativa, posicion) => ({ alternativa, posicion }))
    // Por ahora la app es solo de hombre: fuera lo que la IA ve de mujer (la URL y el título no
    // siempre lo dicen). Pero si la tienda dice que es de hombre, manda la tienda: la IA se equivoca a veces.
    .filter(({ alternativa, posicion }) => {
      if (atributos?.get(posicion)?.publico !== "mujer") return true;
      return dichoDeHombre(alternativa.producto.titulo, alternativa.producto.url);
    })
    // Fuera las que se parecen poco (sobre todo las de otro color: tienen que ser casi la misma prenda).
    .filter(({ posicion }) => !pocoParecidas.has(posicion) && sePareceLoSuficiente(atributos?.get(posicion) ?? null, exigencia))
    // El mismo color primero: es lo que más se nota al ver dos prendas juntas.
    .sort(
      (a, b) =>
        otroColor(a.alternativa) - otroColor(b.alternativa) ||
        (b.alternativa.similitud?.total ?? -1) - (a.alternativa.similitud?.total ?? -1) ||
        a.posicion - b.posicion,
    )
    .map(({ alternativa }) => alternativa);
  return {
    alternativas: ordenadas,
    deOtroColor: ordenadas.filter((a) => a.mismo_color === false).length,
    descartadas: alternativas.length - ordenadas.length,
  };
}

const MARCA_HOMBRE = /\b(hombres?|men|mens|man|caballero)\b/i;

/** El título o la URL de la tienda dicen explícitamente que es de hombre. */
export function dichoDeHombre(titulo: string, url: string): boolean {
  return MARCA_HOMBRE.test(titulo) || MARCA_HOMBRE.test(url.replace(/[/_.-]/g, " "));
}

/** La foto original: si es una de este backend se lee de KV; si no (imagen de la tienda), se descarga. */
export async function imagenOriginal({
  imagenUrl,
  kvImagenes,
  fetchImagenes,
}: Pick<EntradaEvaluacion, "imagenUrl" | "kvImagenes" | "fetchImagenes">): Promise<Imagen | null> {
  if (!imagenUrl) return null;
  const propia = /\/v1\/imagenes\/(an_[0-9a-f]{24})$/.exec(new URL(imagenUrl).pathname)?.[1];
  if (propia) {
    const guardada = await leerImagen(kvImagenes, propia);
    return guardada ? { bytes: new Uint8Array(guardada.bytes), tipo: guardada.tipo } : null;
  }
  return descargarImagen(imagenUrl, fetchImagenes);
}

/** Los embeddings de imagen solo admiten JPEG y PNG. */
function paraEmbeddings(imagen: Imagen | null): ImagenEntrada | null {
  if (!imagen || (imagen.tipo !== "image/jpeg" && imagen.tipo !== "image/png")) return null;
  return { base64: aBase64(imagen.bytes), mime: imagen.tipo };
}

/** Coseno entre la original y cada miniatura (null donde no hay imagen). */
async function similitudesVisuales(ia: ProveedorIA, original: Imagen | null, miniaturas: (Imagen | null)[]) {
  const imagenOriginal = paraEmbeddings(original);
  if (!imagenOriginal) return null;
  const candidatas = miniaturas.map(paraEmbeddings);
  const conImagen = candidatas.flatMap((imagen, indice) => (imagen ? [{ imagen, indice }] : []));
  if (!conImagen.length) return null;

  const [vectorOriginal, ...vectores] = await ia.embeberImagenes([imagenOriginal, ...conImagen.map((c) => c.imagen)]);
  if (!vectorOriginal) return null;
  const resultado: (number | null)[] = miniaturas.map(() => null);
  conImagen.forEach(({ indice }, i) => {
    const vector = vectores[i];
    if (vector) resultado[indice] = coseno(vectorOriginal, vector);
  });
  return resultado;
}

/** Una sola petición a la IA con la original y todas las candidatas (foto pequeña + título). */
async function extraerAtributos(
  ia: ProveedorIA,
  ficha: FichaPrenda,
  alternativas: Alternativa[],
  original: Imagen | null,
  miniaturas: (Imagen | null)[],
): Promise<Map<number, AtributosCandidata>> {
  const partes: ParteEntrada[] = [{ tipo: "texto", texto: describirOriginal(ficha) }];
  if (original) {
    partes.push({ tipo: "texto", texto: "Foto de la prenda original:" });
    partes.push({ tipo: "imagen", base64: aBase64(original.bytes), mime: original.tipo });
  }
  alternativas.forEach((alternativa, indice) => {
    const { titulo, tienda, marca } = alternativa.producto;
    partes.push({ tipo: "texto", texto: `Candidata ${indice}: ${titulo} (${marca ?? tienda.nombre})` });
    const miniatura = miniaturas[indice];
    if (miniatura) partes.push({ tipo: "imagen", base64: aBase64(miniatura.bytes), mime: miniatura.tipo });
  });

  const resultado = await ia.generarJSON({
    instrucciones: INSTRUCCIONES_ATRIBUTOS,
    partes,
    esquema: esquemaAtributos(ficha.detalles),
  });
  return new Map(
    resultado.prendas
      .filter((prenda) => prenda.indice >= 0 && prenda.indice < alternativas.length)
      .map((prenda) => [prenda.indice, prenda]),
  );
}
