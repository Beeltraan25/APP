import { describe, expect, it, vi } from "vitest";
import { RespuestaAnalisis } from "../src/esquemas/analisis";
import { crearApp } from "../src/index";
import { CLAVE_PRUEBA, crearEntorno, formularioConFoto, IASimulada, JPEG_MINIMO, leerError } from "./ayudas";

const cabeceras = { "X-Clave-App": CLAVE_PRUEBA, "X-Instalacion-Id": "instalacion-de-prueba" };

function preparar(ia = new IASimulada(), fetchImagenes?: typeof fetch) {
  const app = crearApp({ crearIA: () => ia, fetchImagenes });
  const { entorno, cache, imagenes } = crearEntorno();
  return { app, entorno, cache, imagenes, ia };
}

describe("seguridad", () => {
  it("/v1/salud responde sin clave", async () => {
    const { app, entorno } = preparar();
    const respuesta = await app.request("/v1/salud", {}, entorno);
    expect(respuesta.status).toBe(200);
  });

  it("rechaza peticiones sin la clave de la app", async () => {
    const { app, entorno, ia } = preparar();
    const respuesta = await app.request("/v1/analizar", { method: "POST", body: formularioConFoto() }, entorno);
    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toEqual({
      error: { codigo: "CLAVE_NO_VALIDA", mensaje: "Esta app no está autorizada para usar el servidor." },
    });
    expect(ia.llamadas).toBe(0);
  });

  it("limita las peticiones por instalación", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const app = crearApp({ crearIA: () => new IASimulada() });
    const { entorno } = crearEntorno({ LIMITADOR: { limit } as unknown as RateLimit });
    const respuesta = await app.request("/v1/tiendas", { headers: cabeceras }, entorno);
    expect(respuesta.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "inst:instalacion-de-prueba" });
  });

  it("las rutas desconocidas dan un 404 en español", async () => {
    const { app, entorno } = preparar();
    const respuesta = await app.request("/v1/no-existe", { headers: cabeceras }, entorno);
    expect(respuesta.status).toBe(404);
    expect((await leerError(respuesta)).codigo).toBe("NO_ENCONTRADO");
  });
});

describe("POST /v1/analizar con foto", () => {
  it("devuelve la ficha y guarda la foto para Google Lens", async () => {
    const { app, entorno, imagenes } = preparar();
    const respuesta = await app.request(
      "http://dupe.test/v1/analizar",
      { method: "POST", body: formularioConFoto(), headers: cabeceras },
      entorno,
    );
    expect(respuesta.status).toBe(200);

    const datos = RespuestaAnalisis.parse(await respuesta.json());
    expect(datos.ficha.categoria).toBe("sudadera");
    expect(datos.ficha.publico).toBe("hombre");
    expect(datos.producto_origen).toBeNull();
    expect(datos.imagen_url).toBe(`http://dupe.test/v1/imagenes/${datos.analisis_id}`);
    expect(imagenes.escrituras).toBe(1);

    // La foto se puede descargar sin clave (Google Lens no la tiene).
    const foto = await app.request(`/v1/imagenes/${datos.analisis_id}`, {}, entorno);
    expect(foto.status).toBe(200);
    expect(foto.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await foto.arrayBuffer())).toEqual(JPEG_MINIMO);
  });

  it("la misma foto se sirve desde la caché sin volver a llamar a la IA", async () => {
    const { app, entorno, ia } = preparar();
    const pedir = () =>
      app.request("/v1/analizar", { method: "POST", body: formularioConFoto(), headers: cabeceras }, entorno);

    const primera = await (await pedir()).json();
    const segunda = await (await pedir()).json();
    expect(segunda).toEqual(primera);
    expect(ia.llamadas).toBe(1);
  });

  it("envía la foto a la IA en base64", async () => {
    const { app, entorno, ia } = preparar();
    await app.request("/v1/analizar", { method: "POST", body: formularioConFoto(), headers: cabeceras }, entorno);
    expect(ia.ultimaPeticion?.partes[1]).toEqual({ tipo: "imagen", base64: "/9j/4AAQSkZJRgAB", mime: "image/jpeg" });
  });

  it("rechaza archivos que no son imágenes", async () => {
    const { app, entorno, ia } = preparar();
    const respuesta = await app.request(
      "/v1/analizar",
      { method: "POST", body: formularioConFoto(new TextEncoder().encode("no soy una foto")), headers: cabeceras },
      entorno,
    );
    expect(respuesta.status).toBe(415);
    expect((await leerError(respuesta)).codigo).toBe("IMAGEN_NO_VALIDA");
    expect(ia.llamadas).toBe(0);
  });

  it("si no hay prenda devuelve 422 y no guarda la foto", async () => {
    const { app, entorno, imagenes } = preparar(new IASimulada({ prenda_detectada: false }));
    const respuesta = await app.request(
      "/v1/analizar",
      { method: "POST", body: formularioConFoto(), headers: cabeceras },
      entorno,
    );
    expect(respuesta.status).toBe(422);
    expect((await leerError(respuesta)).codigo).toBe("PRENDA_NO_DETECTADA");
    expect(imagenes.escrituras).toBe(0);
  });

  it("rechaza ropa de mujer con un mensaje claro", async () => {
    const { app, entorno } = preparar(new IASimulada({ publico_detectado: "mujer" }));
    const respuesta = await app.request(
      "/v1/analizar",
      { method: "POST", body: formularioConFoto(), headers: cabeceras },
      entorno,
    );
    expect(respuesta.status).toBe(422);
    expect(await leerError(respuesta)).toEqual({
      codigo: "SOLO_HOMBRE",
      mensaje: "Por ahora Dupe Finder solo busca ropa de hombre.",
    });
  });
});

describe("POST /v1/analizar con enlace", () => {
  const pagina = {
    url: "https://www.zara.com/es/es/sudadera-capucha-p01234.html?v1=555&utm_source=instagram",
    titulo: "SUDADERA CAPUCHA HEAVYWEIGHT",
    imagen_url: "https://static.zara.net/foto.jpg",
    precio_texto: "29,95 EUR",
    descripcion: "Sudadera de cuello con capucha y manga larga.",
    json_ld: {
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Product", name: "SUDADERA", material: "100% algodón", offers: { price: "29.95", priceCurrency: "EUR" } }],
    },
  };

  const pedir = (app: ReturnType<typeof crearApp>, entorno: unknown, cuerpo: unknown) =>
    app.request(
      "/v1/analizar",
      { method: "POST", body: JSON.stringify(cuerpo), headers: { ...cabeceras, "Content-Type": "application/json" } },
      entorno as never,
    );

  it("devuelve la ficha y la prenda original con tienda, precio y rango", async () => {
    const fetchImagenes = vi.fn<typeof fetch>(async () => new Response(JPEG_MINIMO, { headers: { "Content-Type": "image/jpeg" } }));
    const { app, entorno, ia } = preparar(new IASimulada(), fetchImagenes);

    const respuesta = await pedir(app, entorno, { pagina });
    expect(respuesta.status).toBe(200);
    const datos = RespuestaAnalisis.parse(await respuesta.json());

    expect(datos.imagen_url).toBe("https://static.zara.net/foto.jpg");
    expect(datos.producto_origen).toMatchObject({
      titulo: "SUDADERA CAPUCHA HEAVYWEIGHT",
      tienda: { id: "zara", nombre: "Zara" },
      marca: "Zara",
      url: "https://www.zara.com/es/es/sudadera-capucha-p01234.html?v1=555",
      precio: { centimos: 2995, moneda: "EUR" },
      rango: "medio",
    });

    // La IA recibe el texto de la página y la imagen de la tienda.
    const [texto, imagen] = ia.ultimaPeticion!.partes;
    expect(texto).toMatchObject({ tipo: "texto" });
    expect((texto as { texto: string }).texto).toContain("Material: 100% algodón");
    expect(imagen).toMatchObject({ tipo: "imagen", mime: "image/jpeg" });
    expect(fetchImagenes).toHaveBeenCalledWith("https://static.zara.net/foto.jpg", expect.anything());
  });

  it("si no puede descargar la imagen, analiza solo el texto", async () => {
    const fetchImagenes = vi.fn<typeof fetch>(async () => new Response("prohibido", { status: 403 }));
    const { app, entorno, ia } = preparar(new IASimulada(), fetchImagenes);
    const respuesta = await pedir(app, entorno, { pagina });
    expect(respuesta.status).toBe(200);
    expect(ia.ultimaPeticion!.partes).toHaveLength(1);
  });

  it("descarta precios que no están en euros", async () => {
    const { app, entorno } = preparar(new IASimulada(), vi.fn<typeof fetch>(async () => new Response(null, { status: 404 })));
    const respuesta = await pedir(app, entorno, {
      pagina: { url: "https://www.asos.com/us/x", titulo: "Hoodie", precio_texto: "$45.00" },
    });
    const datos = RespuestaAnalisis.parse(await respuesta.json());
    expect(datos.producto_origen?.precio).toBeNull();
    expect(datos.producto_origen?.tienda.id).toBe("asos");
    expect(datos.producto_origen?.marca).toBeNull();
  });

  it("si la página no tiene ni texto ni imagen pide una captura", async () => {
    const { app, entorno, ia } = preparar();
    const respuesta = await pedir(app, entorno, { pagina: { url: "https://www.zara.com/es/es/x.html" } });
    expect(respuesta.status).toBe(422);
    expect((await leerError(respuesta)).codigo).toBe("PAGINA_SIN_DATOS");
    expect(ia.llamadas).toBe(0);
  });

  it("explica qué falla si el JSON no es válido", async () => {
    const { app, entorno } = preparar();
    const respuesta = await pedir(app, entorno, { pagina: { url: "no es una url" } });
    expect(respuesta.status).toBe(400);
    const error = await leerError(respuesta);
    expect(error.codigo).toBe("PETICION_NO_VALIDA");
    expect(error.detalle).toContain("url");
  });
});

describe("GET /v1/tiendas", () => {
  it("lista solo las tiendas activas", async () => {
    const { app, entorno } = preparar();
    const respuesta = await app.request("/v1/tiendas", { headers: cabeceras }, entorno);
    const { tiendas } = (await respuesta.json()) as { tiendas: { id: string }[] };
    const ids = tiendas.map((t) => t.id);
    expect(ids).toContain("zara");
    expect(ids).not.toContain("oysho");
    expect(ids).not.toContain("other-stories");
  });
});
