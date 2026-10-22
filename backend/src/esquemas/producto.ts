import { z } from "zod";

/** Económico < 25 € · Medio 25–60 € · Alto más de 60 hasta 150 € · Premium más de 150 € */
export const RangoPrecio = z.enum(["economico", "medio", "alto", "premium"]);
export type RangoPrecio = z.infer<typeof RangoPrecio>;

/** Precio en céntimos enteros, para evitar errores de redondeo. */
export const Precio = z.object({
  centimos: z.number().int().nonnegative(),
  moneda: z.string(),
});
export type Precio = z.infer<typeof Precio>;

export const Tienda = z.object({
  id: z.string(),
  nombre: z.string(),
});
export type Tienda = z.infer<typeof Tienda>;

/** Un producto de una tienda: alternativa, pieza de outfit o prenda original. */
export const Producto = z.object({
  id: z.string(),
  titulo: z.string(),
  tienda: Tienda,
  /** Puede ser distinta de la tienda (Zalando, ASOS, El Corte Inglés venden otras marcas). */
  marca: z.string().nullable(),
  url: z.url(),
  imagen_url: z.url().nullable(),
  precio: Precio,
  precio_anterior: Precio.nullable(),
  rango: RangoPrecio,
});
export type Producto = z.infer<typeof Producto>;

/** La prenda original de un enlace: puede que la página no muestre el precio. */
export const ProductoOrigen = Producto.extend({
  precio: Precio.nullable(),
  rango: RangoPrecio.nullable(),
});
export type ProductoOrigen = z.infer<typeof ProductoOrigen>;
