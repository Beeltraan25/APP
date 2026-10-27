import { describe, expect, it, vi } from "vitest";
import { normalizarFicha } from "../src/analisis/normalizar";
import { fichaIAEjemplo } from "./ayudas";
import type { Candidato, ClienteSerpapi } from "../src/busqueda/serpapi";
import { RespuestaInspiracion } from "../src/esquemas/inspiracion";
import { crearApp } from "../src/index";
import { consultaPinterest } from "../src/inspiracion/inspiracionPinterest";
import type { PeticionJSON, ProveedorIA } from "../src/ia/proveedor";
import { CLAVE_PRUEBA, crearEntorno, JPEG_MINIMO, leerError } from "./ayudas";

const ficha = normalizarFicha(fichaIAEjemplo(), "foto");

/**
 * La IA de estilista propone las ideas; la de comparar puntúa cada producto. «parecidos» dice
 * cuánto se parece cada producto (por su título); sin dato, 80.
 */
class IAInspiracion implements ProveedorIA {
  peticionIdeas: PeticionJSON<unknown> | null = null;
  peticionComparar: PeticionJSON<unknown> | null = null;
  constructor(private readonly parecidos: Record<string, number> = {}) {}

  async generarJSON<T>(peticion: PeticionJSON<T>): Promise<T> {
    if (peticion.instrucciones.includes("estilista")) {
      this.peticionIdeas = peticion as PeticionJSON<unknown>;
      return peticion.esquema.parse({
        rollo: "Streetwear cómodo, con vaqueros anchos y zapatillas.",
        ideas: [
          { titulo: "Igual, más gruesa", consulta: "sudadera gris heavyweight hombre" },
          { titulo: "En negro", consulta: "sudadera negra oversize hombre" },
        ],
      });
    }
    this.peticionComparar = peticion as PeticionJSON<unknown>;
    const titulos = [...peticion.partes.flatMap((p) => (p.tipo === "texto" ? [...p.texto.matchAll(/Candidata (\d+): (Sudadera \d+)/g)] : []))];
    return peticion.esquema.parse({
      prendas: titulos.map(([, indice, titulo]) => ({
        indice: Number(indice),
        misma_prenda: true,
        mismo_color: true,
        parecido: this.parecidos[titulo!] ?? 80,
        publico: "hombre",
        color: null,
        fibras: [],
        gramaje_estimado: null,
        fit: null,
        detalles_presentes: ["bolsillo canguro"],
      })),
    });
  }

  async embeberImagenes(imagenes: { base64: string }[]): Promise<number[][]> {
    return imagenes.map(() => [1, 0]);
  }
}
const cabeceras = { "X-Clave-App": CLAVE_PRUEBA, "Content-Type": "application/json" };

function candidato(n: number, tienda = "Zalando.es"): Candidato {
  return {
    fuente: "shopping",
    posicion: n,
    titulo: `Sudadera ${n}`,
    url: `https://www.google.es/search?prds=${n}`,
    nombreTienda: tienda,
    imagen: `https://img.example/${n}.jpg`,
    miniatura: null,
    precio: { centimos: 2995 + n, moneda: "EUR" },
    precioAnterior: null,
  };
}

function preparar(parecidos: Record<string, number> = {}) {
  const serpapi = {
    lens: vi.fn(async () => []),
    // Cada idea encuentra productos distintos, salvo el 1, que aparece en las dos primeras.
    shopping: vi.fn(async (consulta: string) =>
      consulta.includes("gris") ? [candidato(1), candidato(2)] : [candidato(1), candidato(3), candidato(4, "Tienda rara")],
    ),
    imagenes: vi.fn(async () => [
      { imagen: "https://i.pinimg.com/a.jpg", titulo: "Look sudadera gris", fuente: "Pinterest", enlace: "https://www.pinterest.com/pin/1" },
      { imagen: "https://i.pinimg.com/b.jpg", titulo: null, fuente: "Pinterest", enlace: null },
    ]),
  } satisfies ClienteSerpapi;
  const ia = new IAInspiracion(parecidos);
  const descargas = vi.fn<typeof fetch>(async () => new Response(JPEG_MINIMO, { headers: { "Content-Type": "image/jpeg" } }));
  const app = crearApp({ crearIA: () => ia, crearSerpapi: () => serpapi, fetchImagenes: descargas });
  const { entorno } = crearEntorno();
  const pedir = (cuerpo: unknown) =>
    app.request("/v1/inspiracion", { method: "POST", body: JSON.stringify(cuerpo), headers: cabeceras }, entorno);
  return { serpapi, ia, pedir };
}

describe("POST /v1/inspiracion", () => {
  it("busca la prenda en Pinterest", () => {
    expect(consultaPinterest(ficha)).toBe("sudadera oversize gris pesada hombre outfit site:pinterest.com");
  });

  it("devuelve el rollo, las referencias y productos de cada idea, sin repetir", async () => {
    const { serpapi, ia, pedir } = preparar();
    const respuesta = await pedir({ ficha });
    expect(respuesta.status).toBe(200);
    const datos = RespuestaInspiracion.parse(await respuesta.json());

    expect(datos.rollo).toContain("Streetwear");
    expect(datos.referencias).toHaveLength(2);
    expect(datos.referencias[0]?.enlace).toBe("https://www.pinterest.com/pin/1");
    expect(serpapi.shopping).toHaveBeenCalledTimes(2);
    // La IA ve las fotos de Pinterest.
    expect(ia.peticionIdeas!.partes.filter((p) => p.tipo === "imagen")).toHaveLength(2);

    const ids = datos.ideas.flatMap((idea) => idea.productos.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    // Solo tiendas de la lista blanca.
    expect(datos.ideas.flatMap((i) => i.productos).every((p) => p.tienda.id === "zalando")).toBe(true);
  });

  it("quita los productos que se parecen poco a la prenda", async () => {
    const { ia, pedir } = preparar({ "Sudadera 3": 30 });
    const datos = RespuestaInspiracion.parse(await (await pedir({ ficha, imagen_url: null })).json());
    const titulos = datos.ideas.flatMap((i) => i.productos.map((p) => p.titulo));
    expect(titulos).toContain("Sudadera 1");
    expect(titulos).not.toContain("Sudadera 3");
    expect(ia.peticionComparar!.instrucciones).toContain("parecido");
  });

  it("con el precio de la prenda, las ideas solo traen prendas más baratas", async () => {
    const { serpapi, pedir } = preparar();
    // Los productos de prueba cuestan 29,96–29,99 €.
    const datos = RespuestaInspiracion.parse(await (await pedir({ ficha, precio_original_centimos: 2998 })).json());
    const precios = datos.ideas.flatMap((i) => i.productos.map((p) => p.precio.centimos));
    expect(precios.length).toBeGreaterThan(0);
    expect(precios.every((c) => c < 2998)).toBe(true);
    // Quedan pocas: busca también de más barata a más cara.
    expect(serpapi.shopping).toHaveBeenCalledWith(expect.any(String), { ordenarPorPrecio: true });
  });

  it("pide ideas de la misma silueta", async () => {
    const { ia, pedir } = preparar();
    await pedir({ ficha });
    expect(ia.peticionIdeas!.instrucciones).toContain("MUY PARECIDAS");
  });

  it("no repite lo que ya se muestra y la segunda vez sale de la caché", async () => {
    const { serpapi, pedir } = preparar();
    const primera = RespuestaInspiracion.parse(await (await pedir({ ficha })).json());
    const yaMostrados = primera.ideas[0]!.productos.map((p) => p.id);

    const segunda = RespuestaInspiracion.parse(await (await pedir({ ficha, excluir: yaMostrados })).json());
    expect(segunda.desde_cache).toBe(true);
    expect(segunda.ideas.flatMap((i) => i.productos).some((p) => yaMostrados.includes(p.id))).toBe(false);
    expect(serpapi.imagenes).toHaveBeenCalledOnce();
  });

  it("rechaza una petición sin ficha", async () => {
    const { pedir } = preparar();
    const respuesta = await pedir({});
    expect(respuesta.status).toBe(400);
    expect((await leerError(respuesta)).codigo).toBe("PETICION_NO_VALIDA");
  });
});
