import type { Alternativa } from "../esquemas/busqueda";
import type { FichaPrenda } from "../esquemas/ficha";
import type { ImagenEntrada, ParteEntrada, ProveedorIA } from "../ia/proveedor";
import { descargarImagen, leerImagen, type TipoImagen } from "../infra/imagenes";
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
}

/**
 * Puntúa cada alternativa (0–100) y le pone hasta 3 etiquetas. Se ordenan de más a menos parecida.
 * Si la IA falla, se devuelven igualmente: sin el dato que falte (o sin similitud si no hay ninguno).
 */
export async function evaluarAlternativas(entrada: EntradaEvaluacion): Promise<Alternativa[]> {
  const { ia, ficha, alternativas } = entrada;
  if (!alternativas.length) return alternativas;

  const [original, miniaturas] = await Promise.all([
    imagenOriginal(entrada),
    Promise.all(entrada.miniaturas.map((url) => (url ? descargarImagen(url, entrada.fetchImagenes) : Promise.resolve(null)))),
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

  const evaluadas = alternativas.map((alternativa, indice) => {
    const attrs = atributos?.get(indice) ?? null;
    const labCandidata = attrs?.color ? hexALab(attrs.color.hex) : null;
    const deltaE = labOriginal && labCandidata ? deltaE2000(labOriginal, labCandidata) : null;
    const fibras = attrs?.fibras.map(normalizarFibra) ?? [];
    const visual = visuales?.[indice] ?? null;
    const mismaPrenda = attrs?.misma_prenda ?? true;

    const similitud = combinar(
      {
        visual: visual === null ? null : puntuacionVisual(visual),
        color: deltaE === null ? null : puntuacionColor(deltaE),
        gramaje: puntuacionGramaje(ficha.gramaje_estimado, attrs?.gramaje_estimado ?? null),
        material: puntuacionMaterial(fibrasOriginal, fibras),
        fit: puntuacionFit(ficha.fit, attrs?.fit ?? null),
        detalles: attrs ? puntuacionDetalles(ficha.detalles, attrs.detalles_presentes) : null,
      },
      mismaPrenda,
    );

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

    return { ...alternativa, similitud, etiquetas };
  });

  return evaluadas
    .map((alternativa, posicion) => ({ alternativa, posicion }))
    // Por ahora la app es solo de hombre: fuera lo que la IA ve de mujer (la URL y el título no
    // siempre lo dicen). Pero si la tienda dice que es de hombre, manda la tienda: la IA se equivoca a veces.
    .filter(({ alternativa, posicion }) => {
      if (atributos?.get(posicion)?.publico !== "mujer") return true;
      return dichoDeHombre(alternativa.producto.titulo, alternativa.producto.url);
    })
    .sort((a, b) => (b.alternativa.similitud?.total ?? -1) - (a.alternativa.similitud?.total ?? -1) || a.posicion - b.posicion)
    .map(({ alternativa }) => alternativa);
}

const MARCA_HOMBRE = /\b(hombres?|men|mens|man|caballero)\b/i;

/** El título o la URL de la tienda dicen explícitamente que es de hombre. */
export function dichoDeHombre(titulo: string, url: string): boolean {
  return MARCA_HOMBRE.test(titulo) || MARCA_HOMBRE.test(url.replace(/[/_.-]/g, " "));
}

/** La foto original: si es una de este backend se lee de KV; si no (imagen de la tienda), se descarga. */
async function imagenOriginal({ imagenUrl, kvImagenes, fetchImagenes }: EntradaEvaluacion): Promise<Imagen | null> {
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
