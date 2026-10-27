import { Hono } from "hono";
import { z } from "zod";
import type { ClienteSerpapi } from "../busqueda/serpapi";
import type { ContextoApp, Entorno } from "../entorno";
import { PeticionInspiracion } from "../esquemas/inspiracion";
import type { ProveedorIA } from "../ia/proveedor";
import { Errores } from "../infra/errores";
import { exigirClaveApp, limitarPeticiones } from "../infra/seguridad";
import { inspiracionPinterest } from "../inspiracion/inspiracionPinterest";

/**
 * POST /v1/inspiracion — { ficha, excluir } → el «rollo» de la prenda según Pinterest y más
 * prendas de ese estilo. Va aparte de /v1/buscar: gasta ~4 consultas de SerpAPI y la app solo
 * lo pide cuando el usuario quiere más opciones.
 */
export function crearRutaInspiracion(dependencias: {
  crearSerpapi: (entorno: Entorno) => ClienteSerpapi;
  crearIA: (entorno: Entorno) => ProveedorIA;
  fetchImagenes?: typeof fetch;
}) {
  return new Hono<ContextoApp>().use(exigirClaveApp, limitarPeticiones).post("/", async (c) => {
    let cuerpo: unknown;
    try {
      cuerpo = await c.req.json();
    } catch {
      throw Errores.peticionNoValida("El cuerpo no es un JSON válido.");
    }
    const peticion = PeticionInspiracion.safeParse(cuerpo);
    if (!peticion.success) throw Errores.peticionNoValida(z.prettifyError(peticion.error));

    const { consultas, ...respuesta } = await inspiracionPinterest({
      serpapi: dependencias.crearSerpapi(c.env),
      ia: dependencias.crearIA(c.env),
      kv: c.env.CACHE,
      ficha: peticion.data.ficha,
      excluir: peticion.data.excluir,
      imagenUrl: peticion.data.imagen_url ?? null,
      precioOriginal: peticion.data.precio_original_centimos ?? null,
      kvImagenes: c.env.IMAGENES,
      fetchImagenes: dependencias.fetchImagenes,
    });
    console.log(`Inspiración: ${respuesta.ideas.length} ideas con ${consultas} consulta(s) de SerpAPI`);
    return c.json(respuesta);
  });
}
