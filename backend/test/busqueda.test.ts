import { describe, expect, it, vi } from "vitest";
import { normalizarFicha } from "../src/analisis/normalizar";
import {
  buscarAlternativas,
  consultaTexto,
  esDeMujer,
  esPublica,
  MINIMO_SIN_SHOPPING,
} from "../src/busqueda/buscarAlternativas";
import { tiendaDeNombre } from "../src/busqueda/listaBlanca";
import {
  comprobarRespuesta,
  crearClienteSerpapi,
  leerLens,
  leerPrecio,
  leerShopping,
  type Candidato,
  type ClienteSerpapi,
} from "../src/busqueda/serpapi";
import { RespuestaBusqueda } from "../src/esquemas/busqueda";
import { crearApp } from "../src/index";
import { CLAVE_PRUEBA, crearEntorno, fichaIAEjemplo, IASimulada, leerError } from "./ayudas";

const ficha = normalizarFicha(fichaIAEjemplo(), "pagina");

function candidato(parcial: Partial<Candidato>): Candidato {
  return {
    fuente: "lens",
    posicion: 1,
    titulo: "Sudadera oversize con capucha",
    url: "https://www.zara.com/es/es/sudadera-p1.html",
    nombreTienda: "Zara",
    imagen: "https://static.zara.net/a.jpg",
    miniatura: null,
    precio: { centimos: 2995, moneda: "EUR" },
    precioAnterior: null,
    ...parcial,
  };
}

function serpapiFalso(lens: Candidato[], shopping: Candidato[] = []) {
  return {
    lens: vi.fn(async () => lens),
    shopping: vi.fn(async () => shopping),
    imagenes: vi.fn(async () => []),
  } satisfies ClienteSerpapi;
}

describe("lectura de respuestas de SerpAPI", () => {
  it("lee Google Lens con el precio como objeto o como texto", () => {
    const candidatos = leerLens({
      visual_matches: [
        {
          position: 1,
          title: "Sudadera capucha",
          link: "https://www.zara.com/es/es/x.html",
          source: "Zara",
          image: "https://static.zara.net/x.jpg",
          price: { value: "29,95 €", extracted_value: 29.95, currency: "€" },
        },
        { position: 2, title: "Hoodie", link: "https://www.asos.com/x", source: "ASOS", price: "39,99 €" },
        { position: 3, title: "Sin enlace" },
      ],
    });
    expect(candidatos).toHaveLength(2);
    expect(candidatos[0]).toMatchObject({ fuente: "lens", precio: { centimos: 2995, moneda: "EUR" } });
    expect(candidatos[1]?.precio).toEqual({ centimos: 3999, moneda: "EUR" });
  });

  it("lee Google Shopping usando product_link (no da la URL de la tienda)", () => {
    const [primero] = leerShopping({
      shopping_results: [
        {
          position: 4,
          title: "Sudadera capucha gris",
          product_link: "https://www.google.com/search?ibp=oshop&prds=1",
          source: "Pull&Bear",
          price: "25,99 €",
          extracted_price: 25.99,
          old_price: "35,99 €",
          extracted_old_price: 35.99,
          thumbnail: "https://encrypted-tbn0.gstatic.com/x",
        },
      ],
    });
    expect(primero).toMatchObject({
      fuente: "shopping",
      posicion: 4,
      url: "https://www.google.com/search?ibp=oshop&prds=1",
      nombreTienda: "Pull&Bear",
      precio: { centimos: 2599, moneda: "EUR" },
      precioAnterior: { centimos: 3599, moneda: "EUR" },
    });
  });

  it("los precios sin moneda o a cero no valen", () => {
    expect(leerPrecio("29,95")).toBeNull();
    expect(leerPrecio("0,00 €", 0)).toBeNull();
    expect(leerPrecio("$45.00", 45)).toEqual({ centimos: 4500, moneda: "USD" });
  });

  it("traduce los errores de SerpAPI", () => {
    expect(comprobarRespuesta(200, { error: "Google hasn't returned any results for this query." })).toEqual({});
    expect(() => comprobarRespuesta(429, { error: "Your account has run out of searches." })).toThrow(
      /límite gratuito de búsquedas/,
    );
    expect(() => comprobarRespuesta(401, { error: "Invalid API key." })).toThrow(/no está bien configurado/);
    expect(() => comprobarRespuesta(500, null)).toThrow(/No hemos podido buscar/);
  });

  it("pide los resultados de España con la clave", async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json({ shopping_results: [] }));
    const cliente = crearClienteSerpapi({ ...crearEntorno().entorno, SERPAPI_KEY: "clave-serpapi" }, f);
    await cliente.shopping("sudadera gris hombre");
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.searchParams.get("engine")).toBe("google_shopping");
    expect(url.searchParams.get("gl")).toBe("es");
    expect(url.searchParams.get("q")).toBe("sudadera gris hombre");
    expect(url.searchParams.get("api_key")).toBe("clave-serpapi");
  });
});

describe("filtros", () => {
  it("reconoce tiendas por el nombre que usa Google Shopping", () => {
    expect(tiendaDeNombre("Zalando.es")?.id).toBe("zalando");
    expect(tiendaDeNombre("Pull & Bear")?.id).toBe("pull-and-bear");
    expect(tiendaDeNombre("El Corte Ingles")?.id).toBe("el-corte-ingles");
    expect(tiendaDeNombre("H&M")?.id).toBe("hm");
    expect(tiendaDeNombre("Mango Outlet")).toBeNull();
    expect(tiendaDeNombre("Oysho", { soloActivas: true })).toBeNull();
  });

  it("detecta secciones de mujer por el título o la URL", () => {
    expect(esDeMujer(candidato({ titulo: "Sudadera mujer capucha" }))).toBe(true);
    expect(esDeMujer(candidato({ url: "https://www.zara.com/es/es/mujer-sudaderas-l1.html" }))).toBe(true);
    expect(esDeMujer(candidato({ url: "https://www2.hm.com/es_es/productpage.women.123.html" }))).toBe(true);
    expect(esDeMujer(candidato({ url: "https://www2.hm.com/es_es/productpage.men.123.html" }))).toBe(false);
    expect(esDeMujer(candidato({ titulo: "Sudadera unisex" }))).toBe(false);
  });

  it("no envía a Google Lens imágenes del backend local", () => {
    expect(esPublica("http://127.0.0.1:8787/v1/imagenes/an_1")).toBe(false);
    expect(esPublica("http://localhost:8787/v1/imagenes/an_1")).toBe(false);
    expect(esPublica("https://dupe-finder.workers.dev/v1/imagenes/an_1")).toBe(true);
  });

  it("la búsqueda de texto siempre pide ropa de hombre", () => {
    expect(consultaTexto(ficha)).toBe("sudadera oversize gris pesada hombre");
    expect(consultaTexto({ ...ficha, palabras_clave_busqueda: ["heavyweight hoodie grey"] })).toBe(
      "heavyweight hoodie grey hombre",
    );
  });
});

describe("buscarAlternativas", () => {
  const imagen = "https://dupe-finder.workers.dev/v1/imagenes/an_1";

  it("solo deja tiendas activas de la lista blanca, de hombre y con precio en euros", async () => {
    const serpapi = serpapiFalso([
      candidato({ posicion: 1 }),
      candidato({ posicion: 2, url: "https://www.tiendadesconocida.com/x", nombreTienda: "Desconocida" }),
      candidato({ posicion: 3, url: "https://www.oysho.com/es/x", nombreTienda: "Oysho" }),
      candidato({ posicion: 4, titulo: "Sudadera mujer", url: "https://www.bershka.com/es/x" }),
      candidato({ posicion: 5, url: "https://www.asos.com/us/x", precio: { centimos: 4500, moneda: "USD" } }),
      candidato({ posicion: 6, url: "https://www.mango.com/es/x", precio: null }),
    ]);
    const { alternativas } = await buscarAlternativas(serpapi, { imagenUrl: imagen, ficha });
    expect(alternativas.map((a) => a.producto.tienda.id)).toEqual(["zara"]);
  });

  it("si Lens da pocos resultados, completa con Shopping", async () => {
    const serpapi = serpapiFalso(
      [candidato({})],
      [
        candidato({
          fuente: "shopping",
          url: "https://www.google.com/search?prds=1",
          nombreTienda: "Zalando.es",
          titulo: "Carhartt WIP Hoodie",
          precio: { centimos: 9995, moneda: "EUR" },
        }),
      ],
    );
    const { alternativas, consultas } = await buscarAlternativas(serpapi, { imagenUrl: imagen, ficha });
    expect(consultas).toBe(2);
    expect(serpapi.shopping).toHaveBeenCalledWith("sudadera oversize gris pesada hombre");
    expect(alternativas.map((a) => a.fuente)).toEqual(["lens", "shopping"]);
    expect(alternativas[1]?.producto).toMatchObject({ tienda: { id: "zalando" }, marca: null, rango: "alto" });
  });

  it("si Lens ya da bastantes, no gasta otra consulta en Shopping", async () => {
    const tiendas = ["zara", "bershka", "pullandbear", "lefties", "massimodutti", "cos"];
    const lens = tiendas.slice(0, MINIMO_SIN_SHOPPING).map((dominio, i) =>
      candidato({ posicion: i + 1, url: `https://www.${dominio}.com/es/x${i}.html`, titulo: `Sudadera ${i}` }),
    );
    const serpapi = serpapiFalso(lens);
    const { consultas } = await buscarAlternativas(serpapi, { imagenUrl: imagen, ficha });
    expect(consultas).toBe(1);
    expect(serpapi.shopping).not.toHaveBeenCalled();
  });

  it("con la imagen en localhost solo busca por texto", async () => {
    const serpapi = serpapiFalso([], []);
    await buscarAlternativas(serpapi, { imagenUrl: "http://127.0.0.1:8787/v1/imagenes/an_1", ficha });
    expect(serpapi.lens).not.toHaveBeenCalled();
    expect(serpapi.shopping).toHaveBeenCalledOnce();
  });

  it("quita duplicados y conserva el precio anterior solo si era mayor", async () => {
    const serpapi = serpapiFalso([
      candidato({ posicion: 1, precioAnterior: { centimos: 3995, moneda: "EUR" } }),
      candidato({ posicion: 2, url: "https://www.zara.com/es/es/sudadera-p1.html?utm_source=x" }),
      candidato({
        posicion: 3,
        titulo: "Sudadera básica con capucha",
        url: "https://www.zara.com/es/es/otra-p2.html",
        precioAnterior: { centimos: 1000, moneda: "EUR" },
      }),
    ]);
    const { alternativas } = await buscarAlternativas(serpapi, { imagenUrl: imagen, ficha });
    expect(alternativas).toHaveLength(2);
    expect(alternativas[0]?.producto.precio_anterior).toEqual({ centimos: 3995, moneda: "EUR" });
    expect(alternativas[1]?.producto.precio_anterior).toBeNull();
  });

  it("si Lens falla, sigue con Shopping; sin cuota, se para", async () => {
    const { Errores } = await import("../src/infra/errores");
    const fallaLens = { ...serpapiFalso([], [candidato({ fuente: "shopping" })]), lens: vi.fn(async () => { throw Errores.busquedaNoDisponible(); }) };
    const { alternativas } = await buscarAlternativas(fallaLens, { imagenUrl: imagen, ficha });
    expect(alternativas).toHaveLength(1);

    const sinCuota = { ...serpapiFalso([]), lens: vi.fn(async () => { throw Errores.cuotaBusquedas(); }) };
    await expect(buscarAlternativas(sinCuota, { imagenUrl: imagen, ficha })).rejects.toMatchObject({ codigo: "CUOTA_BUSQUEDAS" });
  });
});

describe("POST /v1/buscar", () => {
  const cabeceras = { "X-Clave-App": CLAVE_PRUEBA, "Content-Type": "application/json" };
  const cuerpo = JSON.stringify({ imagen_url: "https://dupe-finder.workers.dev/v1/imagenes/an_1", ficha });

  it("devuelve alternativas con el conteo por rango y las guarda en caché", async () => {
    const serpapi = serpapiFalso([
      candidato({ posicion: 1 }),
      candidato({ posicion: 2, url: "https://www.massimodutti.com/es/x", nombreTienda: "Massimo Dutti", precio: { centimos: 7995, moneda: "EUR" } }),
    ]);
    const app = crearApp({ crearIA: () => new IASimulada(), crearSerpapi: () => serpapi });
    const { entorno } = crearEntorno();

    const primera = await app.request("/v1/buscar", { method: "POST", body: cuerpo, headers: cabeceras }, entorno);
    expect(primera.status).toBe(200);
    const datos = RespuestaBusqueda.parse(await primera.json());
    expect(datos.alternativas).toHaveLength(2);
    expect(datos.conteo_por_rango).toEqual({ economico: 0, medio: 1, alto: 1, premium: 0 });
    expect(datos.desde_cache).toBe(false);

    const segunda = RespuestaBusqueda.parse(
      await (await app.request("/v1/buscar", { method: "POST", body: cuerpo, headers: cabeceras }, entorno)).json(),
    );
    expect(segunda.desde_cache).toBe(true);
    expect(serpapi.lens).toHaveBeenCalledOnce();
  });

  it("rechaza una ficha no válida", async () => {
    const app = crearApp({ crearIA: () => new IASimulada(), crearSerpapi: () => serpapiFalso([]) });
    const { entorno } = crearEntorno();
    const respuesta = await app.request(
      "/v1/buscar",
      { method: "POST", body: JSON.stringify({ ficha: { categoria: "x" } }), headers: cabeceras },
      entorno,
    );
    expect(respuesta.status).toBe(400);
    expect((await leerError(respuesta)).codigo).toBe("PETICION_NO_VALIDA");
  });

  it("sin clave de SerpAPI avisa de que falta configurar el servidor", async () => {
    const app = crearApp({ crearIA: () => new IASimulada() });
    const { entorno } = crearEntorno();
    const respuesta = await app.request("/v1/buscar", { method: "POST", body: cuerpo, headers: cabeceras }, entorno);
    expect(respuesta.status).toBe(500);
    expect((await leerError(respuesta)).codigo).toBe("SERVIDOR_NO_CONFIGURADO");
  });
});

describe("fichas enviadas desde Swift", () => {
  it("acepta una ficha sin las claves que valen null (JSONEncoder las omite)", async () => {
    const serpapi = serpapiFalso([candidato({})]);
    const app = crearApp({ crearIA: () => new IASimulada(), crearSerpapi: () => serpapi });
    const { entorno } = crearEntorno();
    const { cuello, mangas, cierres, subcategoria, ...sinNulos } = { ...ficha, cuello: null, mangas: null, cierres: null, subcategoria: null };
    void cuello; void mangas; void cierres; void subcategoria;
    const respuesta = await app.request(
      "/v1/buscar",
      { method: "POST", body: JSON.stringify({ ficha: sinNulos }), headers: { "X-Clave-App": CLAVE_PRUEBA, "Content-Type": "application/json" } },
      entorno,
    );
    expect(respuesta.status).toBe(200);
  });
});
