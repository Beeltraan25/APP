import { z } from "zod";
import { ausentesComoNull } from "./entrada";
import { FichaPrenda } from "./ficha";
import { Producto } from "./producto";

export const PeticionInspiracion = z.object({
  /** La ficha tal como la ha revisado el usuario. */
  ficha: ausentesComoNull(FichaPrenda),
  /** Productos que ya se están mostrando (no se repiten). */
  excluir: z.array(z.string()).max(80).default([]),
});
export type PeticionInspiracion = z.infer<typeof PeticionInspiracion>;

/** Lo que propone la IA tras ver las referencias de Pinterest. */
export const InspiracionIA = z.object({
  rollo: z.string().describe("Una o dos frases: qué estilo o rollo transmite la prenda y cómo se lleva en las referencias"),
  ideas: z
    .array(
      z.object({
        titulo: z.string().describe("Nombre corto de la idea, p. ej. «Barrel en lavado claro»"),
        consulta: z.string().describe("Búsqueda para Google Shopping España: 3–6 palabras, en español, con «hombre»"),
      }),
    )
    .min(2)
    .max(4),
});
export type InspiracionIA = z.infer<typeof InspiracionIA>;

export const ReferenciaPinterest = z.object({
  imagen: z.string(),
  titulo: z.string().nullable(),
  /** Página del pin. */
  enlace: z.string().nullable(),
});

export const IdeaInspiracion = z.object({
  titulo: z.string(),
  consulta: z.string(),
  productos: z.array(Producto),
});

export const RespuestaInspiracion = z.object({
  rollo: z.string(),
  referencias: z.array(ReferenciaPinterest),
  ideas: z.array(IdeaInspiracion),
  desde_cache: z.boolean(),
});
export type RespuestaInspiracion = z.infer<typeof RespuestaInspiracion>;
