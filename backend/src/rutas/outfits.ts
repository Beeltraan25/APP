import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ClienteSerpapi } from "../busqueda/serpapi";
import type { ContextoApp, Entorno } from "../entorno";
import {
  PeticionCambiarPieza,
  PeticionOutfits,
  type EventoOutfits,
  type RespuestaOutfits,
} from "../esquemas/outfit";
import type { ProveedorIA } from "../ia/proveedor";
import { guardarCache, leerCache } from "../infra/cache";
import { ErrorApp, Errores } from "../infra/errores";
import { exigirClaveApp, limitarPeticiones } from "../infra/seguridad";
import { sha256Hex } from "../infra/utilidades";
import { generarOutfits } from "../outfits/generarOutfits";
import { buscarPieza } from "../outfits/piezas";

export interface DependenciasOutfits {
  crearSerpapi: (entorno: Entorno) => ClienteSerpapi;
  crearIA: (entorno: Entorno) => ProveedorIA;
  fetchImagenes?: typeof fetch;
}

async function leerJson<T>(c: Context<ContextoApp>, esquema: z.ZodType<T>): Promise<T> {
  let cuerpo: unknown;
  try {
    cuerpo = await c.req.json();
  } catch {
    throw Errores.peticionNoValida("El cuerpo no es un JSON válido.");
  }
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) throw Errores.peticionNoValida(z.prettifyError(resultado.error));
  return resultado.data;
}

/**
 * Respuesta por líneas (NDJSON): la app va mostrando el progreso mientras se generan los outfits
 * (20–30 s). Los errores a mitad de camino llegan como una línea { "tipo": "error" }.
 */
function respuestaPorLineas(c: Context<ContextoApp>, trabajo: (enviar: (evento: EventoOutfits) => Promise<void>) => Promise<void>) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const escritor = writable.getWriter();
  const codificador = new TextEncoder();
  const enviar = (evento: EventoOutfits) => escritor.write(codificador.encode(`${JSON.stringify(evento)}\n`));

  const tarea = (async () => {
    try {
      await trabajo(enviar);
    } catch (error) {
      const errorApp = error instanceof ErrorApp ? error : Errores.interno();
      if (!(error instanceof ErrorApp) || errorApp.estado >= 500) console.error("Outfits:", error);
      await enviar({ tipo: "error", error: { codigo: errorApp.codigo, mensaje: errorApp.message } });
    } finally {
      await escritor.close();
    }
  })();
  try {
    c.executionCtx.waitUntil(tarea);
  } catch {
    // Fuera de Cloudflare (tests) no hay executionCtx; el stream mantiene viva la tarea igualmente.
  }

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function crearRutaOutfits({ crearSerpapi, crearIA, fetchImagenes }: DependenciasOutfits) {
  return (
    new Hono<ContextoApp>()
      .use(exigirClaveApp, limitarPeticiones)
      /** POST /v1/outfits — 3 outfits con la prenda base, en el estilo y presupuesto pedidos. */
      .post("/", async (c) => {
        const peticion = await leerJson(c, PeticionOutfits);
        // Si falta alguna clave, se avisa antes de empezar (con un error normal, no en el stream).
        const serpapi = crearSerpapi(c.env);
        const ia = crearIA(c.env);

        const huella = await sha256Hex(JSON.stringify(peticion));
        const claveCache = `outfits:${huella}`;

        return respuestaPorLineas(c, async (enviar) => {
          const enCache = await leerCache<RespuestaOutfits>(c.env.CACHE, claveCache);
          if (enCache) {
            await enviar({ tipo: "resultado", datos: { ...enCache, desde_cache: true } });
            return;
          }
          const { consultas, ...respuesta } = await generarOutfits({
            serpapi,
            ia,
            kv: c.env.CACHE,
            peticion,
            fetchImagenes,
            progreso: (paso, mensaje) => enviar({ tipo: "progreso", paso, mensaje }),
          });
          console.log(`Outfits: ${respuesta.outfits.length} con ${consultas} consulta(s) de SerpAPI`);
          await guardarCache(c.env.CACHE, claveCache, respuesta);
          await enviar({ tipo: "resultado", datos: respuesta });
        });
      })
      /** POST /v1/outfits/cambiar-pieza — otras opciones para una pieza (de la caché si ya se buscó). */
      .post("/cambiar-pieza", async (c) => {
        const { consulta, presupuesto, excluir } = await leerJson(c, PeticionCambiarPieza);
        const { productos } = await buscarPieza(
          crearSerpapi(c.env),
          c.env.CACHE,
          consulta,
          presupuesto.maximo_por_prenda_centimos,
        );
        return c.json({ opciones: productos.filter((producto) => !excluir.includes(producto.id)).slice(0, 8) });
      })
  );
}
