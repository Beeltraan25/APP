import { describe, expect, it, vi } from "vitest";
import { normalizarFicha } from "../src/analisis/normalizar";
import type { Candidato, ClienteSerpapi } from "../src/busqueda/serpapi";
import { RespuestaOutfits, type EventoOutfits } from "../src/esquemas/outfit";
import type { PeticionJSON, ProveedorIA } from "../src/ia/proveedor";
import { Errores } from "../src/infra/errores";
import { crearApp } from "../src/index";
import { INSTRUCCIONES_PERFIL } from "../src/outfits/perfilEstilo";
import { normalizarConsulta, type PlanIA } from "../src/outfits/plan";
import { CLAVE_PRUEBA, crearEntorno, fichaIAEjemplo, JPEG_MINIMO, leerError } from "./ayudas";

const ficha = normalizarFicha(fichaIAEjemplo(), "pagina");
const cabeceras = { "X-Clave-App": CLAVE_PRUEBA, "Content-Type": "application/json" };

const perfil = {
  resumen: "Prendas clásicas de buena calidad en tonos neutros.",
  prendas_tipicas: [
    { rol: "superior", descripcion: "polo de punto" },
    { rol: "inferior", descripcion: "chino beige" },
    { rol: "abrigo", descripcion: "americana azul marino" },
    { rol: "calzado", descripcion: "mocasines" },
  ],
  paleta: [
    { nombre: "Beige", hex: "#d8c8b0" },
    { nombre: "azul marino", hex: "#1F2A44" },
    { nombre: "blanco", hex: "#FFFFFF" },
  ],
  siluetas: ["recta"],
  calzado: ["mocasines"],
};

function plan(piezasPorOutfit?: PlanIA["outfits"][number]["piezas"][]): PlanIA {
  const piezas = piezasPorOutfit ?? [
    [
      { rol: "inferior", descripcion: "chino beige", consulta: "Chino beige hombre" },
      { rol: "calzado", descripcion: "mocasines marrones", consulta: "mocasines marrones" },
    ],
    [
      { rol: "inferior", descripcion: "pantalón de pinzas gris", consulta: "pantalón pinzas gris hombre" },
      { rol: "calzado", descripcion: "mocasines marrones", consulta: "mocasines marrones hombre" },
      { rol: "superior", descripcion: "otra sudadera", consulta: "sudadera hombre" },
    ],
    [
      { rol: "inferior", descripcion: "vaquero recto", consulta: "vaquero recto azul hombre" },
      { rol: "calzado", descripcion: "zapatillas blancas", consulta: "zapatillas blancas piel hombre" },
    ],
  ];
  return {
    rol_prenda_base: "superior",
    outfits: piezas.map((p, i) => ({ titulo: `Outfit ${i + 1}`, por_que_encaja: "Encaja.", piezas: p })),
  };
}

class IAOutfits implements ProveedorIA {
  constructor(private readonly planIA: PlanIA = plan()) {}
  async embeberImagenes() {
    return [];
  }
  async generarJSON<T>(peticion: PeticionJSON<T>): Promise<T> {
    return peticion.esquema.parse(peticion.instrucciones === INSTRUCCIONES_PERFIL ? perfil : this.planIA);
  }
}

/** Shopping simulado: para cada consulta, 3 productos de Zara con precios 20, 45 y 90 €. */
function serpapiFalso() {
  return {
    lens: vi.fn(async (): Promise<Candidato[]> => []),
    imagenes: vi.fn(async () => [
      { imagen: "https://img/ref1.jpg", titulo: "Look 1", fuente: "Vogue" },
      { imagen: "https://img/ref2.jpg", titulo: "Look 2", fuente: "GQ" },
    ]),
    // De más barato a más caro trae otras más baratas.
    shopping: vi.fn(async (consulta: string, opciones?: { ordenarPorPrecio?: boolean }): Promise<Candidato[]> =>
      (opciones?.ordenarPorPrecio ? [1500, 2500, 3000] : [2000, 4500, 9000])
        .map((centimos, i) => ({
          fuente: "shopping" as const,
          posicion: i + 1,
          titulo: `${consulta} ${opciones?.ordenarPorPrecio ? "barata " : ""}${i + 1}`,
          url: `https://www.google.es/search?prds=${encodeURIComponent(consulta)}-${opciones?.ordenarPorPrecio ? "b" : ""}${i}`,
          nombreTienda: "Zara",
          imagen: `https://img/${i}.jpg`,
          miniatura: null,
          precio: { centimos, moneda: "EUR" },
          precioAnterior: null,
        })),
    ),
  } satisfies ClienteSerpapi;
}

function preparar(ia: ProveedorIA = new IAOutfits(), serpapi = serpapiFalso()) {
  const app = crearApp({
    crearIA: () => ia,
    crearSerpapi: () => serpapi,
    fetchImagenes: vi.fn<typeof fetch>(async () => new Response(JPEG_MINIMO)),
  });
  const { entorno } = crearEntorno();
  return { app, entorno, serpapi };
}

function peticion(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    prenda_base: { ficha, producto: null, imagen_url: "https://img/base.jpg" },
    estilo: "old money",
    presupuesto: { maximo_por_prenda_centimos: 6000 },
    ...extra,
  });
}

async function eventos(respuesta: Response): Promise<EventoOutfits[]> {
  const texto = await respuesta.text();
  return texto
    .split("\n")
    .filter(Boolean)
    .map((linea) => JSON.parse(linea) as EventoOutfits);
}

function resultado(lista: EventoOutfits[]) {
  const ultimo = lista.at(-1);
  if (ultimo?.tipo !== "resultado") throw new Error(`Se esperaba un resultado: ${JSON.stringify(ultimo)}`);
  return RespuestaOutfits.parse(ultimo.datos);
}

describe("POST /v1/outfits", () => {
  it("envía el progreso por pasos y termina con 3 outfits", async () => {
    const { app, entorno } = preparar();
    const respuesta = await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno);
    expect(respuesta.headers.get("Content-Type")).toContain("application/x-ndjson");

    const lista = await eventos(respuesta);
    expect(lista.filter((e) => e.tipo === "progreso").map((e) => (e as { paso: string }).paso)).toEqual([
      "referencias",
      "estilo",
      "plan",
      "piezas",
    ]);
    const datos = resultado(lista);
    expect(datos.outfits).toHaveLength(3);
    expect(datos.perfil_estilo.estilo).toBe("old money");
    expect(datos.perfil_estilo.paleta[0]).toEqual({ nombre: "beige", hex: "#D8C8B0" });
  });

  it("cada outfit lleva la prenda base y ninguna pieza con su mismo papel", async () => {
    const { app, entorno } = preparar();
    const datos = resultado(
      await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno)),
    );
    for (const outfit of datos.outfits) {
      const base = outfit.piezas.filter((p) => p.es_prenda_base);
      expect(base).toHaveLength(1);
      expect(base[0]).toMatchObject({ rol: "superior", imagen_url: "https://img/base.jpg", producto: null });
      expect(outfit.piezas.filter((p) => p.rol === "superior")).toHaveLength(1);
      // Orden del collage: de arriba abajo.
      expect(outfit.piezas.map((p) => p.rol)).toEqual([...outfit.piezas.map((p) => p.rol)].sort((a, b) =>
        ["abrigo", "superior", "vestido", "inferior", "calzado", "bolso", "accesorio"].indexOf(a) -
        ["abrigo", "superior", "vestido", "inferior", "calzado", "bolso", "accesorio"].indexOf(b),
      ));
    }
  });

  it("respeta el presupuesto por prenda y suma el precio total", async () => {
    const { app, entorno, serpapi } = preparar();
    const datos = resultado(
      await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno)),
    );
    // Sin el precio máximo de Google (apenas devuelve nada): se filtra aquí.
    expect(serpapi.shopping).not.toHaveBeenCalledWith(expect.any(String), { ordenarPorPrecio: true });
    for (const outfit of datos.outfits) {
      const precios = outfit.piezas.flatMap((p) => (p.producto?.precio ? [p.producto.precio.centimos] : []));
      expect(precios.every((c) => c <= 6000)).toBe(true);
      expect(outfit.precio_total.centimos).toBe(precios.reduce((a, b) => a + b, 0));
    }
  });

  it("repite la misma búsqueda entre outfits y nunca hace más de 6", async () => {
    const muchas = Array.from({ length: 3 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => ({ rol: "accesorio" as const, descripcion: `pieza ${i}${j}`, consulta: `pieza ${i}${j}` })),
    );
    const { app, entorno, serpapi } = preparar(new IAOutfits(plan(muchas)));
    await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno));
    expect(serpapi.shopping.mock.calls.length).toBeLessThanOrEqual(6);

    // "mocasines marrones" y "mocasines marrones hombre" son la misma búsqueda.
    const otra = preparar();
    await eventos(await otra.app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, otra.entorno));
    const consultas = otra.serpapi.shopping.mock.calls.map(([consulta]) => consulta);
    expect(consultas.filter((c) => c === "mocasines marrones hombre")).toHaveLength(1);
  });

  it("el perfil del estilo y las piezas se reutilizan de la caché", async () => {
    const { app, entorno, serpapi } = preparar();
    await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno));
    // Mismo estilo, otro presupuesto: no vuelve a buscar referencias.
    const lista = await eventos(
      await app.request(
        "/v1/outfits",
        { method: "POST", body: peticion({ presupuesto: { maximo_por_prenda_centimos: null } }), headers: cabeceras },
        entorno,
      ),
    );
    expect(serpapi.imagenes).toHaveBeenCalledOnce();
    expect(resultado(lista).desde_cache).toBe(false);

    // La misma petición exacta sale entera de la caché.
    const repetida = await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno));
    expect(repetida).toHaveLength(1);
    expect(resultado(repetida).desde_cache).toBe(true);
  });

  it("si una pieza no aparece, usa una del mismo tipo encontrada para otro outfit", async () => {
    const serpapi = serpapiFalso();
    const original = serpapi.shopping.getMockImplementation()!;
    serpapi.shopping.mockImplementation(async (consulta, opciones) =>
      consulta.startsWith("zapatillas") ? [] : original(consulta, opciones),
    );
    const { app, entorno } = preparar(new IAOutfits(), serpapi);
    const datos = resultado(
      await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno)),
    );
    const tercero = datos.outfits.find((o) => o.id === "out_3")!;
    const calzado = tercero.piezas.find((p) => p.rol === "calzado");
    expect(calzado?.consulta).toBe("mocasines marrones hombre");
  });

  it("si se agota la cuota a mitad, el error llega en el stream", async () => {
    const serpapi = serpapiFalso();
    serpapi.shopping.mockImplementation(async () => {
      throw Errores.cuotaBusquedas();
    });
    const { app, entorno } = preparar(new IAOutfits(), serpapi);
    const lista = await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno));
    expect(lista.at(-1)).toEqual({
      tipo: "error",
      error: { codigo: "CUOTA_BUSQUEDAS", mensaje: Errores.cuotaBusquedas().message },
    });
  });

  it("rechaza un estilo vacío antes de empezar", async () => {
    const { app, entorno } = preparar();
    const respuesta = await app.request("/v1/outfits", { method: "POST", body: peticion({ estilo: " " }), headers: cabeceras }, entorno);
    expect(respuesta.status).toBe(400);
    expect((await leerError(respuesta)).codigo).toBe("PETICION_NO_VALIDA");
  });
});

describe("POST /v1/outfits/cambiar-pieza", () => {
  it("devuelve otras opciones sin repetir las que ya se usan, desde la caché", async () => {
    const { app, entorno, serpapi } = preparar();
    const datos = resultado(
      await eventos(await app.request("/v1/outfits", { method: "POST", body: peticion(), headers: cabeceras }, entorno)),
    );
    const pieza = datos.outfits[0]!.piezas.find((p) => !p.es_prenda_base)!;
    const llamadasAntes = serpapi.shopping.mock.calls.length;

    const respuesta = await app.request(
      "/v1/outfits/cambiar-pieza",
      {
        method: "POST",
        body: JSON.stringify({ consulta: pieza.consulta, presupuesto: { maximo_por_prenda_centimos: 6000 }, excluir: [pieza.producto!.id] }),
        headers: cabeceras,
      },
      entorno,
    );
    const { opciones } = (await respuesta.json()) as { opciones: { id: string; precio: { centimos: number } }[] };
    expect(opciones.length).toBeGreaterThan(0);
    expect(opciones.some((o) => o.id === pieza.producto!.id)).toBe(false);
    expect(opciones.every((o) => o.precio.centimos <= 6000)).toBe(true);
    expect(serpapi.shopping.mock.calls.length).toBe(llamadasAntes);
  });
});

describe("normalizarConsulta", () => {
  it("quita espacios, pasa a minúsculas y añade 'hombre'", () => {
    expect(normalizarConsulta("  Mocasines   Ante MARRÓN ")).toBe("mocasines ante marrón hombre");
    expect(normalizarConsulta("polo hombre azul")).toBe("polo hombre azul");
  });
});
