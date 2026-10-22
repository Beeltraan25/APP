import { z } from "zod";
import { FichaPrenda } from "./ficha";
import { Producto, RangoPrecio } from "./producto";

export const PeticionBusqueda = z.object({
  /** Imagen pública para Google Lens (la de /v1/analizar). Si no hay, solo se busca por texto. */
  imagen_url: z.url().nullish(),
  /** La ficha tal como la ha revisado el usuario. */
  ficha: FichaPrenda,
});
export type PeticionBusqueda = z.infer<typeof PeticionBusqueda>;

export const Etiqueta = z.object({
  texto: z.string(),
  tipo: z.enum(["coincide", "diferencia"]),
});

export const CriterioSimilitud = z.object({
  criterio: z.enum(["visual", "color", "gramaje", "material", "fit", "detalles"]),
  peso_base: z.number(),
  peso_aplicado: z.number(),
  puntuacion: z.number().int().nullable(),
  disponible: z.boolean(),
});

export const Similitud = z.object({
  total: z.number().int().min(0).max(100),
  criterios: z.array(CriterioSimilitud),
});

export const Alternativa = z.object({
  producto: Producto,
  /** Se calcula en la fase 4. Hasta entonces, null. */
  similitud: Similitud.nullable(),
  etiquetas: z.array(Etiqueta),
  fuente: z.enum(["lens", "shopping"]),
});
export type Alternativa = z.infer<typeof Alternativa>;

export const RespuestaBusqueda = z.object({
  busqueda_id: z.string(),
  alternativas: z.array(Alternativa),
  conteo_por_rango: z.record(RangoPrecio, z.number().int()),
  desde_cache: z.boolean(),
});
export type RespuestaBusqueda = z.infer<typeof RespuestaBusqueda>;
