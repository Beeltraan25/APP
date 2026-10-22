import { z } from "zod";
import { FichaPrenda } from "./ficha";
import { ProductoOrigen } from "./producto";

export const RespuestaAnalisis = z.object({
  analisis_id: z.string(),
  /** URL pública de la imagen para Google Lens: la foto guardada 24 h o la imagen de la tienda. */
  imagen_url: z.url().nullable(),
  /** Solo cuando se analiza un enlace. */
  producto_origen: ProductoOrigen.nullable(),
  ficha: FichaPrenda,
});
export type RespuestaAnalisis = z.infer<typeof RespuestaAnalisis>;
