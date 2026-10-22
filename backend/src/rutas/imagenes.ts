import { Hono } from "hono";
import type { ContextoApp } from "../entorno";
import { Errores } from "../infra/errores";
import { leerImagen } from "../infra/imagenes";

/**
 * GET /v1/imagenes/:id — sirve una foto subida desde la app durante 24 h.
 * Es pública (sin clave) porque la tiene que leer Google Lens; el id es una huella imposible de adivinar.
 */
export const rutaImagenes = new Hono<ContextoApp>().get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^an_[0-9a-f]{24}$/.test(id)) throw Errores.noEncontrado();
  const imagen = await leerImagen(c.env.IMAGENES, id);
  if (!imagen) throw Errores.noEncontrado();
  return c.body(imagen.bytes, 200, { "Content-Type": imagen.tipo, "Cache-Control": "public, max-age=3600" });
});
