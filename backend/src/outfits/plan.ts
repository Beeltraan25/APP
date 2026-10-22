import { z } from "zod";
import type { FichaPrenda } from "../esquemas/ficha";
import { RolPieza, type PerfilEstilo } from "../esquemas/outfit";

/** Como mucho estas búsquedas en Shopping por tanda de outfits (el plan gratuito da ~250 al mes). */
export const MAXIMO_CONSULTAS = 6;

export const PlanIA = z.object({
  rol_prenda_base: RolPieza.describe("Qué papel cumple la prenda base en el outfit"),
  outfits: z
    .array(
      z.object({
        titulo: z.string().describe("2–4 palabras con gancho, p. ej. 'Domingo en el club'"),
        por_que_encaja: z.string().describe("Una frase: por qué el outfit encaja con el estilo y con la prenda base"),
        piezas: z
          .array(
            z.object({
              rol: RolPieza,
              descripcion: z.string().describe("Prenda concreta, p. ej. 'polo de punto fino crudo'"),
              consulta: z.string().describe("Búsqueda para Google Shopping España, 3–6 palabras, con 'hombre'"),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .min(3)
    .max(3),
});
export type PlanIA = z.infer<typeof PlanIA>;

export const INSTRUCCIONES_PLAN = `Eres estilista de moda masculina. Diseñas 3 outfits distintos alrededor de una prenda base, siguiendo un estilo, y devuelves el plan en el esquema JSON.

Reglas:
- Cada outfit lleva la prenda base (no la incluyas en "piezas") y entre 2 y 4 piezas más, siempre con calzado.
- Ninguna pieza puede tener el mismo papel (rol) que la prenda base.
- Usa la paleta, las siluetas y el calzado típicos del estilo, y combina bien con el color de la prenda base.
- Los 3 outfits deben ser claramente distintos (por ejemplo: diario, más arreglado y fin de semana).
- "consulta": lo que escribirías en Google Shopping España para encontrar esa pieza en tiendas como Zara, Mango, H&M o Massimo Dutti: 3–6 palabras, en español, con color y con "hombre".
- Como mucho ${MAXIMO_CONSULTAS} consultas distintas entre los 3 outfits: si una pieza sirve para varios (por ejemplo, el mismo calzado), repite exactamente la misma consulta.
- Si hay presupuesto por prenda, elige piezas que normalmente se encuentran por debajo de ese precio en tiendas como Zara, Pull&Bear o H&M. Con presupuestos bajos (60 € o menos) evita americanas, abrigos de paño o piel: no se encuentran a ese precio. "por_que_encaja" debe hablar solo de las piezas del outfit.
- Escribe en español de España.`;

export function promptPlan(ficha: FichaPrenda, perfil: PerfilEstilo, maximoCentimos: number | null): string {
  const lineas = [
    `Prenda base: ${ficha.categoria}${ficha.subcategoria ? ` (${ficha.subcategoria})` : ""}, color ${ficha.color_principal.nombre}${ficha.fit ? `, fit ${ficha.fit}` : ""}${ficha.material ? `, ${ficha.material}` : ""}.`,
    "",
    `Estilo: ${perfil.estilo}. ${perfil.resumen}`,
    `- Prendas típicas: ${perfil.prendas_tipicas.map((p) => p.descripcion).join("; ")}`,
    `- Paleta: ${perfil.paleta.map((c) => c.nombre).join(", ")}`,
    `- Siluetas: ${perfil.siluetas.join(", ")}`,
    `- Calzado: ${perfil.calzado.join(", ")}`,
    "",
    maximoCentimos ? `Presupuesto: como mucho ${Math.floor(maximoCentimos / 100)} € por prenda.` : "Sin límite de presupuesto.",
  ];
  return lineas.join("\n");
}

/** "Mocasines  Ante MARRÓN" → "mocasines ante marrón hombre" (sin espacios de más y siempre con "hombre"). */
export function normalizarConsulta(consulta: string): string {
  const limpia = consulta.toLowerCase().replace(/\s+/g, " ").trim();
  return /\bhombre\b/.test(limpia) ? limpia : `${limpia} hombre`;
}
