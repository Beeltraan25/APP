import { Hono } from "hono";
import { z } from "zod";
import { buscarAlternativas, contarPorRango } from "../busqueda/buscarAlternativas";
import type { ClienteSerpapi } from "../busqueda/serpapi";
import type { ContextoApp, Entorno } from "../entorno";
import type { ProveedorIA } from "../ia/proveedor";
import { evaluarAlternativas } from "../similitud/evaluarAlternativas";
import { PeticionBusqueda, type RespuestaBusqueda } from "../esquemas/busqueda";
import { guardarCache, leerCache, TTL_24_HORAS } from "../infra/cache";
import { Errores } from "../infra/errores";
import { exigirClaveApp, limitarPeticiones } from "../infra/seguridad";
import { sha256Hex } from "../infra/utilidades";

export interface DependenciasBuscar {
  crearSerpapi: (entorno: Entorno) => ClienteSerpapi;
  crearIA: (entorno: Entorno) => ProveedorIA;
  fetchImagenes?: typeof fetch;
}

/**
 * POST /v1/buscar — { imagen_url, ficha } → alternativas en tiendas de la lista blanca, puntuadas
 * por similitud y ordenadas de más a menos parecida.
 * Devuelve todos los rangos de precio a la vez: la app cambia de rango sin gastar otra consulta.
 */
export function crearRutaBuscar({ crearSerpapi, crearIA, fetchImagenes }: DependenciasBuscar) {
  return new Hono<ContextoApp>().use(exigirClaveApp, limitarPeticiones).post("/", async (c) => {
    let cuerpo: unknown;
    try {
      cuerpo = await c.req.json();
    } catch {
      throw Errores.peticionNoValida("El cuerpo no es un JSON válido.");
    }
    const peticion = PeticionBusqueda.safeParse(cuerpo);
    if (!peticion.success) throw Errores.peticionNoValida(z.prettifyError(peticion.error));
    const { imagen_url: imagenUrl, ficha } = peticion.data;

    // La misma imagen con la misma ficha da los mismos resultados durante 24 h.
    const huella = await sha256Hex(JSON.stringify({ imagenUrl: imagenUrl ?? null, ficha }));
    const claveCache = `busqueda:${huella}`;
    const enCache = await leerCache<RespuestaBusqueda>(c.env.CACHE, claveCache);
    if (enCache) return c.json({ ...enCache, desde_cache: true });

    const encontradas = await buscarAlternativas(crearSerpapi(c.env), {
      cache: c.env.CACHE,
      imagenUrl: imagenUrl ?? null,
      ficha,
    });
    console.log(`Búsqueda: ${encontradas.alternativas.length} alternativas con ${encontradas.consultas} consulta(s) de SerpAPI`);

    // Similitud y etiquetas. Si la IA no está disponible, los resultados se devuelven sin ellas.
    let alternativas = encontradas.alternativas;
    let deOtroColor = 0;
    try {
      ({ alternativas, deOtroColor } = await evaluarAlternativas({
        ia: crearIA(c.env),
        ficha,
        alternativas,
        miniaturas: encontradas.miniaturas,
        imagenUrl: imagenUrl ?? null,
        kvImagenes: c.env.IMAGENES,
        fetchImagenes,
      }));
    } catch (error) {
      console.warn("No se ha podido puntuar la similitud", error);
    }

    const respuesta: RespuestaBusqueda = {
      busqueda_id: `bs_${huella.slice(0, 24)}`,
      alternativas,
      conteo_por_rango: contarPorRango(alternativas),
      de_otro_color: deOtroColor,
      desde_cache: false,
    };
    // Sin resultados se guarda menos tiempo, por si era algo puntual.
    await guardarCache(c.env.CACHE, claveCache, respuesta, alternativas.length ? TTL_24_HORAS : 60 * 60);
    return c.json(respuesta);
  });
}
