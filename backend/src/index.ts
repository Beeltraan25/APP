import { Hono } from "hono";
import type { ContextoApp, Entorno } from "./entorno";
import { crearProveedorGemini } from "./ia/gemini";
import type { ProveedorIA } from "./ia/proveedor";
import { ErrorApp, Errores, respuestaError } from "./infra/errores";
import { crearRutaAnalizar } from "./rutas/analizar";
import { rutaImagenes } from "./rutas/imagenes";
import { rutaTiendas } from "./rutas/tiendas";

export interface Dependencias {
  /** Qué IA usar. Por defecto Gemini; los tests usan una simulada. */
  crearIA: (entorno: Entorno) => ProveedorIA;
  /** Para descargar imágenes de las tiendas. Los tests lo sustituyen. */
  fetchImagenes?: typeof fetch;
}

export function crearApp(dependencias: Partial<Dependencias> = {}) {
  const crearIA = dependencias.crearIA ?? crearProveedorGemini;
  const app = new Hono<ContextoApp>();

  app.get("/v1/salud", (c) => c.json({ estado: "ok" }));
  app.route("/v1/imagenes", rutaImagenes);
  app.route("/v1/analizar", crearRutaAnalizar(crearIA, dependencias.fetchImagenes));
  app.route("/v1/tiendas", rutaTiendas);

  app.notFound((c) => respuestaError(c, Errores.noEncontrado()));
  app.onError((error, c) => {
    if (error instanceof ErrorApp) {
      if (error.estado >= 500) console.error(error.codigo, error.detalle ?? "");
      return respuestaError(c, error);
    }
    console.error("Error inesperado", error);
    return respuestaError(c, Errores.interno());
  });

  return app;
}

export default crearApp();
