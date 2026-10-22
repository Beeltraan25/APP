import { aProducto, deduplicar, filtrar } from "../busqueda/buscarAlternativas";
import type { ClienteSerpapi } from "../busqueda/serpapi";
import type { Producto } from "../esquemas/producto";
import { guardarCache, leerCache } from "../infra/cache";
import { sha256Hex } from "../infra/utilidades";
import { normalizarConsulta } from "./plan";

const MAXIMO_OPCIONES = 10;

/**
 * Productos para una pieza: Google Shopping con precio máximo, solo tiendas de la lista blanca,
 * ropa de hombre, en euros y sin segunda mano. Se guarda 24 h: "Cambiar esta prenda" reutiliza
 * estas mismas opciones sin gastar otra consulta.
 */
export async function buscarPieza(
  serpapi: ClienteSerpapi,
  kv: KVNamespace,
  consulta: string,
  maximoCentimos: number | null,
): Promise<{ productos: Producto[]; consultas: number }> {
  const normalizada = normalizarConsulta(consulta);
  const clave = `pieza:${await sha256Hex(`${normalizada}|${maximoCentimos ?? "sin-limite"}`)}`;
  const enCache = await leerCache<Producto[]>(kv, clave);
  if (enCache) return { productos: enCache, consultas: 0 };

  const candidatos = await serpapi.shopping(normalizada, { maxPrecioCentimos: maximoCentimos });
  const validos = deduplicar(filtrar(candidatos))
    // SerpAPI ya filtra por precio, pero se comprueba por si acaso.
    .filter(({ candidato }) => !maximoCentimos || (candidato.precio?.centimos ?? Infinity) <= maximoCentimos)
    .slice(0, MAXIMO_OPCIONES);
  const productos = await Promise.all(validos.map(aProducto));
  await guardarCache(kv, clave, productos);
  return { productos, consultas: 1 };
}
