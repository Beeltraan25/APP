import { aProducto, deduplicar, filtrar } from "../busqueda/buscarAlternativas";
import type { Candidato, ClienteSerpapi } from "../busqueda/serpapi";
import type { Producto } from "../esquemas/producto";
import { guardarCache, leerCache } from "../infra/cache";
import { sha256Hex } from "../infra/utilidades";
import { normalizarConsulta } from "./plan";

const MAXIMO_OPCIONES = 10;
/** Con menos de estas dentro del presupuesto, se busca otra vez de más barato a más caro. */
const MINIMO_OPCIONES = 4;

/**
 * Productos para una pieza: Google Shopping dentro del presupuesto, solo tiendas de la lista blanca,
 * ropa de hombre, en euros y sin segunda mano. Se guarda 24 h: "Cambiar esta prenda" reutiliza
 * estas mismas opciones sin gastar otra consulta.
 */
export async function buscarPieza(
  serpapi: ClienteSerpapi,
  kv: KVNamespace,
  consulta: string,
  maximoCentimos: number | null,
  /** Si con el presupuesto quedan pocas, buscar otra vez de más barata a más cara (gasta otra consulta). */
  { completarConBaratas = false }: { completarConBaratas?: boolean } = {},
): Promise<{ productos: Producto[]; consultas: number }> {
  const normalizada = normalizarConsulta(consulta);
  const clave = `pieza:${await sha256Hex(`${normalizada}|${maximoCentimos ?? "sin-limite"}|${completarConBaratas}`)}`;
  const enCache = await leerCache<Producto[]>(kv, clave);
  if (enCache) return { productos: enCache, consultas: 0 };

  const dentroDelPrecio = (candidatos: Candidato[]) =>
    deduplicar(filtrar(candidatos)).filter(
      ({ candidato }) => !maximoCentimos || (candidato.precio?.centimos ?? Infinity) <= maximoCentimos,
    );
  let consultas = 1;
  let validos = dentroDelPrecio(await serpapi.shopping(normalizada));
  // Con presupuesto, si lo más relevante es caro, otra vez de más barato a más caro.
  if (completarConBaratas && maximoCentimos && validos.length < MINIMO_OPCIONES) {
    consultas++;
    const baratas = await serpapi.shopping(normalizada, { ordenarPorPrecio: true });
    validos = dentroDelPrecio([...validos.map((v) => v.candidato), ...baratas]);
  }
  validos = validos.slice(0, MAXIMO_OPCIONES);
  const productos = await Promise.all(validos.map(aProducto));
  await guardarCache(kv, clave, productos);
  return { productos, consultas };
}
