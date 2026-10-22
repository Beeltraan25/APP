import { z } from "zod";

export const GramajeEstimado = z.enum(["ligero", "medio", "pesado"]);
export const Fit = z.enum(["ajustado", "regular", "relajado", "oversize", "otro"]);
export const Publico = z.enum(["hombre", "mujer", "unisex"]);

/** Campos que la IA puede marcar como deducidos (no leídos literalmente de la tienda). */
export const CAMPOS_ESTIMABLES = [
  "subcategoria",
  "color_principal",
  "colores_secundarios",
  "estampado",
  "material",
  "composicion",
  "gramaje_gsm",
  "gramaje_estimado",
  "fit",
  "largo",
  "cuello",
  "mangas",
  "cierres",
  "detalles",
  "acabado",
] as const;
export const CampoEstimable = z.enum(CAMPOS_ESTIMABLES);
export type CampoEstimable = z.infer<typeof CampoEstimable>;

const Fibra = z.object({
  fibra: z.string().describe("Nombre de la fibra en español, p. ej. 'algodón'"),
  porcentaje: z.number().int().min(0).max(100),
});

/** Campos compartidos por la respuesta de la IA y por la ficha que recibe la app. */
function camposFicha<C extends z.ZodType>(color: C) {
  return {
    categoria: z.string().describe("Nombre común y corto: 'sudadera', 'camiseta', 'vaqueros', 'zapatillas'…"),
    subcategoria: z.string().nullable().describe("Matiz de la categoría, p. ej. 'oversize con capucha'"),
    color_principal: color,
    colores_secundarios: z.array(color),
    estampado: z.string().describe("'liso' o una descripción breve del estampado"),
    material: z.string().nullable().describe("Material tal y como lo diría la tienda, p. ej. 'algodón 100%'"),
    composicion: z.array(Fibra),
    gramaje_gsm: z.number().int().min(30).max(1500).nullable().describe("Gramaje en g/m² si se conoce o se puede estimar"),
    gramaje_estimado: GramajeEstimado.nullable().describe("ligero (<180 g/m²), medio (180–300) o pesado (>300)"),
    fit: Fit.nullable(),
    largo: z.string().nullable(),
    cuello: z.string().nullable(),
    mangas: z.string().nullable(),
    cierres: z.string().nullable(),
    detalles: z.array(z.string()).describe("2–6 rasgos que distinguen la prenda"),
    acabado: z.string().nullable(),
    palabras_clave_busqueda: z.array(z.string()).describe("3–5 búsquedas cortas; la mayoría en español con 'hombre', una en inglés"),
    campos_estimados: z.array(CampoEstimable).describe("Campos deducidos en vez de leídos literalmente"),
  };
}

/** Color tal como lo devuelve la IA (sin restricciones de formato: se normaliza después). */
const ColorIA = z.object({
  nombre: z.string().describe("Nombre del color en español, p. ej. 'gris marengo'"),
  hex: z.string().describe("Color en formato #RRGGBB"),
});

/** Color ya normalizado. */
export const ColorPrenda = z.object({
  nombre: z.string(),
  hex: z.string().regex(/^#[0-9A-F]{6}$/),
});

/** Lo que devuelve la IA. Este esquema se envía a Gemini para obligarle a responder con este JSON. */
export const FichaIA = z.object({
  prenda_detectada: z.boolean().describe("false si no hay ninguna prenda, calzado o complemento de moda"),
  publico_detectado: Publico.describe("Para quién está diseñada la prenda"),
  ...camposFicha(ColorIA),
});
export type FichaIA = z.infer<typeof FichaIA>;

/** La ficha técnica que recibe la app. */
export const FichaPrenda = z.object({
  ...camposFicha(ColorPrenda),
  /** Por ahora la app es solo de hombre. */
  publico: Publico,
});
export type FichaPrenda = z.infer<typeof FichaPrenda>;
