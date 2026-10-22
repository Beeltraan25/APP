import { z } from "zod";
import { ausentesComoNull } from "./entrada";
import { FichaPrenda } from "./ficha";
import { Precio, ProductoOrigen } from "./producto";

export const RolPieza = z.enum(["superior", "inferior", "vestido", "abrigo", "calzado", "bolso", "accesorio"]);
export type RolPieza = z.infer<typeof RolPieza>;

export const ColorNombrado = z.object({ nombre: z.string(), hex: z.string() });

/** Lo que define un estilo, deducido de 10–20 imágenes de referencia. */
export const PerfilEstilo = z.object({
  estilo: z.string(),
  resumen: z.string(),
  prendas_tipicas: z.array(z.object({ rol: RolPieza, descripcion: z.string() })),
  paleta: z.array(ColorNombrado),
  siluetas: z.array(z.string()),
  calzado: z.array(z.string()),
});
export type PerfilEstilo = z.infer<typeof PerfilEstilo>;

export const PiezaOutfit = z.object({
  id: z.string(),
  rol: RolPieza,
  es_prenda_base: z.boolean(),
  /** Qué se buscaba ("mocasines de ante marrón"). */
  descripcion: z.string(),
  /** Búsqueda en Google Shopping; sirve para "Cambiar esta prenda". Null en la prenda base. */
  consulta: z.string().nullable(),
  /** La prenda base puede no tener producto (foto propia) o no tener precio. */
  producto: ProductoOrigen.nullable(),
  imagen_url: z.url().nullable(),
});
export type PiezaOutfit = z.infer<typeof PiezaOutfit>;

export const Outfit = z.object({
  id: z.string(),
  titulo: z.string(),
  por_que_encaja: z.string(),
  piezas: z.array(PiezaOutfit),
  /** Suma de lo que tiene precio (las piezas nuevas y la base si es de una tienda). */
  precio_total: Precio,
});
export type Outfit = z.infer<typeof Outfit>;

export const Presupuesto = z.object({
  /** Precio máximo de cada pieza nueva. null = sin límite. */
  maximo_por_prenda_centimos: z.number().int().positive().nullable().default(null),
});

export const PeticionOutfits = z.object({
  prenda_base: z.object({
    ficha: ausentesComoNull(FichaPrenda),
    /** La alternativa elegida o la prenda original de un enlace. */
    producto: ausentesComoNull(ProductoOrigen).nullable().optional(),
    /** Foto de la prenda (la de /v1/analizar o la de la tienda). */
    imagen_url: z.url().nullish(),
  }),
  estilo: z.string().trim().min(2).max(40),
  presupuesto: Presupuesto,
});
export type PeticionOutfits = z.infer<typeof PeticionOutfits>;

export const RespuestaOutfits = z.object({
  perfil_estilo: PerfilEstilo,
  outfits: z.array(Outfit),
  desde_cache: z.boolean(),
});
export type RespuestaOutfits = z.infer<typeof RespuestaOutfits>;

/** La respuesta de /v1/outfits llega por líneas (NDJSON): progreso y, al final, el resultado o un error. */
export type EventoOutfits =
  | { tipo: "progreso"; paso: "referencias" | "estilo" | "plan" | "piezas"; mensaje: string }
  | { tipo: "resultado"; datos: RespuestaOutfits }
  | { tipo: "error"; error: { codigo: string; mensaje: string } };

export const PeticionCambiarPieza = z.object({
  consulta: z.string().min(2).max(120),
  presupuesto: Presupuesto,
  /** Productos que ya se están usando (no se vuelven a proponer). */
  excluir: z.array(z.string()).max(50).default([]),
});
