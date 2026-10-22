import type { ClienteSerpapi } from "../busqueda/serpapi";
import type { EventoOutfits, Outfit, PeticionOutfits, PiezaOutfit, RespuestaOutfits, RolPieza } from "../esquemas/outfit";
import type { Producto } from "../esquemas/producto";
import type { ProveedorIA } from "../ia/proveedor";
import { ErrorApp, Errores } from "../infra/errores";
import { obtenerPerfil } from "./perfilEstilo";
import { buscarPieza } from "./piezas";
import { INSTRUCCIONES_PLAN, MAXIMO_CONSULTAS, normalizarConsulta, PlanIA, promptPlan } from "./plan";

type Progreso = Extract<EventoOutfits, { tipo: "progreso" }>;

export interface EntradaOutfits {
  serpapi: ClienteSerpapi;
  ia: ProveedorIA;
  kv: KVNamespace;
  peticion: PeticionOutfits;
  fetchImagenes?: typeof fetch;
  progreso: (paso: Progreso["paso"], mensaje: string) => Promise<void>;
}

/** Orden de las piezas en el collage: de arriba abajo. */
const ORDEN_ROLES: RolPieza[] = ["abrigo", "superior", "vestido", "inferior", "calzado", "bolso", "accesorio"];

/**
 * 1. Perfil del estilo (referencias de Google Images; caché de 30 días).
 * 2. Plan de 3 outfits con Gemini (como mucho 6 búsquedas distintas).
 * 3. Cada pieza en Google Shopping con el precio máximo por prenda.
 */
export async function generarOutfits(entrada: EntradaOutfits): Promise<RespuestaOutfits & { consultas: number }> {
  const { serpapi, ia, kv, peticion, progreso } = entrada;
  const { estilo, prenda_base: base } = peticion;
  const maximo = peticion.presupuesto.maximo_por_prenda_centimos;

  await progreso("referencias", `Buscando referencias de ${estilo}…`);
  const { perfil, consultas: consultasPerfil } = await obtenerPerfil({
    serpapi,
    ia,
    kv,
    estilo,
    fetchImagenes: entrada.fetchImagenes,
    alAnalizar: () => progreso("estilo", "Analizando el estilo…"),
  });

  await progreso("plan", "Diseñando los outfits…");
  const plan = await ia.generarJSON({
    instrucciones: INSTRUCCIONES_PLAN,
    partes: [{ tipo: "texto", texto: promptPlan(base.ficha, perfil, maximo) }],
    esquema: PlanIA,
  });

  // Consultas únicas (como mucho 6); las piezas que pasen del límite se quedan fuera.
  const consultas: string[] = [];
  const piezasPlan = plan.outfits.map((outfit) =>
    outfit.piezas.filter((pieza) => {
      if (pieza.rol === plan.rol_prenda_base) return false;
      const consulta = normalizarConsulta(pieza.consulta);
      if (!consultas.includes(consulta)) {
        if (consultas.length >= MAXIMO_CONSULTAS) return false;
        consultas.push(consulta);
      }
      return true;
    }),
  );

  await progreso("piezas", "Buscando las piezas en las tiendas…");
  const resultados = new Map<string, Producto[]>();
  let consultasPiezas = 0;
  await Promise.all(
    consultas.map(async (consulta) => {
      try {
        const { productos, consultas: gastadas } = await buscarPieza(serpapi, kv, consulta, maximo);
        resultados.set(consulta, productos);
        consultasPiezas += gastadas;
      } catch (error) {
        // Sin cuota no hay nada que hacer; otros fallos solo dejan esa pieza sin producto.
        if (error instanceof ErrorApp && error.codigo === "CUOTA_BUSQUEDAS") throw error;
        console.warn(`No se ha podido buscar "${consulta}"`, error);
        resultados.set(consulta, []);
      }
    }),
  );

  const piezaBase: Omit<PiezaOutfit, "id"> = {
    rol: plan.rol_prenda_base,
    es_prenda_base: true,
    descripcion: base.ficha.subcategoria ?? base.ficha.categoria,
    consulta: null,
    producto: base.producto ?? null,
    imagen_url: base.imagen_url ?? base.producto?.imagen_url ?? null,
  };

  // Productos encontrados por papel (rol), por si a un outfit le falta una pieza: así puede usar,
  // por ejemplo, el calzado encontrado para otro outfit en lugar de quedarse sin él.
  const porRol = new Map<RolPieza, { producto: Producto; consulta: string; descripcion: string }[]>();
  piezasPlan.flat().forEach((pieza) => {
    const consulta = normalizarConsulta(pieza.consulta);
    for (const producto of resultados.get(consulta) ?? []) {
      porRol.set(pieza.rol, [...(porRol.get(pieza.rol) ?? []), { producto, consulta, descripcion: pieza.descripcion }]);
    }
  });

  const outfits: Outfit[] = plan.outfits.flatMap((outfitPlan, i) => {
    const usados = new Set<string>();
    const nuevas = piezasPlan[i]!.flatMap((pieza): Omit<PiezaOutfit, "id">[] => {
      const consulta = normalizarConsulta(pieza.consulta);
      const propio = resultados.get(consulta)?.find((p) => !usados.has(p.id));
      const elegido = propio
        ? { producto: propio, consulta, descripcion: pieza.descripcion }
        : porRol.get(pieza.rol)?.find(({ producto }) => !usados.has(producto.id));
      if (!elegido) return [];
      usados.add(elegido.producto.id);
      return [
        {
          rol: pieza.rol,
          es_prenda_base: false,
          descripcion: elegido.descripcion,
          consulta: elegido.consulta,
          producto: elegido.producto,
          imagen_url: elegido.producto.imagen_url,
        },
      ];
    });
    // Un outfit con una sola pieza nueva no merece la pena.
    if (nuevas.length < 2) return [];

    const piezas = [piezaBase, ...nuevas]
      .sort((a, b) => ORDEN_ROLES.indexOf(a.rol) - ORDEN_ROLES.indexOf(b.rol))
      .map((pieza, j) => ({ ...pieza, id: `pz_${i + 1}_${j + 1}` }));
    const total = piezas.reduce((suma, pieza) => suma + (pieza.producto?.precio?.centimos ?? 0), 0);
    return [
      {
        id: `out_${i + 1}`,
        titulo: outfitPlan.titulo,
        por_que_encaja: outfitPlan.por_que_encaja,
        piezas,
        precio_total: { centimos: total, moneda: "EUR" },
      },
    ];
  });

  if (!outfits.length) throw Errores.sinPiezas();
  return { perfil_estilo: perfil, outfits, desde_cache: false, consultas: consultasPerfil + consultasPiezas };
}
