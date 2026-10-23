import { Hono, type Context } from "hono";
import { z } from "zod";
import { fichaDesdeFoto } from "../analisis/fichaDesdeFoto";
import { fichaDesdePagina } from "../analisis/fichaDesdePagina";
import { completarPaginaDesdeServidor, paginaVacia } from "../analisis/leerPaginaServidor";
import { buscarProductoJsonLd, leerProductoJsonLd } from "../analisis/jsonLd";
import { productoDesdePagina } from "../analisis/productoDesdePagina";
import type { ContextoApp, Entorno } from "../entorno";
import type { RespuestaAnalisis } from "../esquemas/analisis";
import { PeticionAnalisisPagina } from "../esquemas/pagina";
import type { ProveedorIA } from "../ia/proveedor";
import { guardarCache, leerCache } from "../infra/cache";
import { Errores } from "../infra/errores";
import { descargarImagen, detectarTipoImagen, guardarImagen, TAMANO_MAXIMO_IMAGEN } from "../infra/imagenes";
import { exigirClaveApp, limitarPeticiones } from "../infra/seguridad";
import { limpiarUrl, sha256Hex } from "../infra/utilidades";

type Contexto = Context<ContextoApp>;

/**
 * POST /v1/analizar
 * - Foto: multipart/form-data con el campo "imagen".
 * - Enlace: JSON { "pagina": DatosPagina } con lo que el iPhone ha leído de la página.
 */
export function crearRutaAnalizar(crearIA: (entorno: Entorno) => ProveedorIA, fetchImagenes?: typeof fetch) {
  return new Hono<ContextoApp>().use(exigirClaveApp, limitarPeticiones).post("/", async (c) => {
    const tipo = c.req.header("Content-Type") ?? "";
    const obtenerIA = () => crearIA(c.env);
    if (tipo.startsWith("multipart/form-data")) return c.json(await analizarFoto(c, obtenerIA));
    if (tipo.startsWith("application/json")) return c.json(await analizarPagina(c, obtenerIA, fetchImagenes));
    throw Errores.peticionNoValida(
      "Envía una foto (multipart/form-data con el campo 'imagen') o un enlace (JSON con 'pagina').",
    );
  });
}

async function analizarFoto(c: Contexto, obtenerIA: () => ProveedorIA): Promise<RespuestaAnalisis> {
  let formulario: FormData;
  try {
    formulario = await c.req.formData();
  } catch {
    throw Errores.peticionNoValida("No se ha podido leer el formulario.");
  }

  const archivo = formulario.get("imagen");
  if (!archivo || typeof archivo === "string") throw Errores.peticionNoValida("Falta el campo 'imagen'.");
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) throw Errores.imagenDemasiadoGrande();

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = detectarTipoImagen(bytes);
  if (!tipo) throw Errores.imagenNoValida();

  // La misma foto da el mismo id: así la caché evita gastar cuota de IA dos veces.
  const huella = await sha256Hex(bytes);
  const id = `an_${huella.slice(0, 24)}`;
  const claveCache = `analisis:foto:${huella}`;
  const enCache = await leerCache<RespuestaAnalisis>(c.env.CACHE, claveCache);
  if (enCache) return enCache;

  const ficha = await fichaDesdeFoto(obtenerIA(), { bytes, tipo });

  // Se guarda la foto después de analizarla: si no hay prenda, no se gasta una escritura de KV.
  const guardada = await guardarImagen(c.env.IMAGENES, id, bytes, tipo);
  const respuesta: RespuestaAnalisis = {
    analisis_id: id,
    imagen_url: guardada ? new URL(`/v1/imagenes/${id}`, c.req.url).toString() : null,
    producto_origen: null,
    ficha,
  };
  if (guardada) await guardarCache(c.env.CACHE, claveCache, respuesta);
  return respuesta;
}

async function analizarPagina(
  c: Contexto,
  obtenerIA: () => ProveedorIA,
  fetchImagenes?: typeof fetch,
): Promise<RespuestaAnalisis> {
  let cuerpo: unknown;
  try {
    cuerpo = await c.req.json();
  } catch {
    throw Errores.peticionNoValida("El cuerpo no es un JSON válido.");
  }
  const peticion = PeticionAnalisisPagina.safeParse(cuerpo);
  if (!peticion.success) throw Errores.peticionNoValida(z.prettifyError(peticion.error));
  let { pagina } = peticion.data;

  const urlLimpia = limpiarUrl(pagina.url);
  const huella = await sha256Hex(urlLimpia);
  const claveCache = `analisis:pagina:${huella}`;
  const enCache = await leerCache<RespuestaAnalisis>(c.env.CACHE, claveCache);
  if (enCache) return enCache;

  // La versión web solo envía el enlace: el servidor intenta leer la página (si la tienda lo permite).
  if (paginaVacia(pagina)) pagina = await completarPaginaDesdeServidor(pagina, fetchImagenes);

  const nodoProducto = buscarProductoJsonLd(pagina.json_ld);
  const jsonLd = nodoProducto ? leerProductoJsonLd(nodoProducto) : null;
  const producto = await productoDesdePagina(pagina, jsonLd, urlLimpia);

  const imagen = producto.imagen_url ? await descargarImagen(producto.imagen_url, fetchImagenes) : null;
  const hayTexto = Boolean(pagina.titulo || pagina.descripcion || jsonLd);
  if (!imagen && !hayTexto) throw Errores.paginaSinDatos();

  const ficha = await fichaDesdePagina(obtenerIA(), {
    pagina,
    jsonLd,
    jsonLdTexto: nodoProducto ? JSON.stringify(nodoProducto).slice(0, 3000) : null,
    producto,
    imagen,
  });

  const respuesta: RespuestaAnalisis = {
    analisis_id: `an_${huella.slice(0, 24)}`,
    imagen_url: producto.imagen_url,
    producto_origen: producto,
    ficha,
  };
  await guardarCache(c.env.CACHE, claveCache, respuesta);
  return respuesta;
}
