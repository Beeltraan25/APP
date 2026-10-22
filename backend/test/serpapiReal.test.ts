import { describe, expect, it } from "vitest";
import { normalizarFicha } from "../src/analisis/normalizar";
import { buscarAlternativas, limpiarTitulo } from "../src/busqueda/buscarAlternativas";
import { TIENDAS } from "../src/busqueda/listaBlanca";
import { leerLens, leerShopping } from "../src/busqueda/serpapi";
import { fichaIAEjemplo } from "./ayudas";
// Respuestas reales de SerpAPI (22/10/2026) con la foto de los vaqueros y "vaqueros anchos hombre".
import lensReal from "./fixtures/serpapi-lens-real.json";
import shoppingReal from "./fixtures/serpapi-shopping-real.json";
const tienda = (id: string) => TIENDAS.find((t) => t.id === id)!;

describe("respuestas reales de SerpAPI", () => {
  it("Google Lens: precio como objeto { value: '70 €*', extracted_value, currency }", () => {
    const candidatos = leerLens(lensReal);
    expect(candidatos).toHaveLength(59);
    const conPrecio = candidatos.filter((c) => c.precio);
    expect(conPrecio).toHaveLength(17);
    expect(conPrecio.every((c) => c.precio?.moneda === "EUR")).toBe(true);
    expect(candidatos.find((c) => c.nombreTienda === "PULL&BEAR")?.precio).toEqual({ centimos: 3000, moneda: "EUR" });
  });

  it("Google Shopping: link vacío, usa product_link y descarta la segunda mano", () => {
    const candidatos = leerShopping(shoppingReal);
    expect(candidatos).toHaveLength(35);
    expect(candidatos.every((c) => c.url.startsWith("https://www.google.es/search?ibp=oshop"))).toBe(true);
    expect(candidatos.every((c) => c.precio?.moneda === "EUR")).toBe(true);
  });

  it("de principio a fin: alternativas de hombre, en euros, sin la tienda ni la talla en el título", async () => {
    const ficha = normalizarFicha({ ...fichaIAEjemplo(), palabras_clave_busqueda: ["vaqueros anchos hombre"] }, "pagina");
    const serpapi = { lens: async () => leerLens(lensReal), shopping: async () => leerShopping(shoppingReal) };
    const { alternativas, consultas } = await buscarAlternativas(serpapi, {
      imagenUrl: "https://raw.githubusercontent.com/Beeltraan25/APP/main/prenda.jpg",
      ficha,
    });

    expect(consultas).toBe(2);
    expect(alternativas.length).toBeGreaterThanOrEqual(15);
    expect(alternativas.every((a) => a.producto.precio.moneda === "EUR")).toBe(true);
    expect(alternativas.some((a) => /\bmujer\b/i.test(a.producto.titulo))).toBe(false);
    expect(alternativas.some((a) => /Talla:/.test(a.producto.titulo))).toBe(false);
    expect(alternativas.some((a) => /\|\s*(Pull&Bear|H&M|COS)\b/i.test(a.producto.titulo))).toBe(false);
    // Lens primero (más parecidos visualmente).
    expect(alternativas[0]?.fuente).toBe("lens");
  });
});

describe("limpiarTitulo", () => {
  it.each([
    ["Jeans barrel tiro bajo | Pull&Bear España", "pull-and-bear", "Jeans barrel tiro bajo"],
    ["Baggy Jeans - Azul denim oscuro - HOMBRE | H&M ES", "hm", "Baggy Jeans - Azul denim oscuro - HOMBRE"],
    ["VAQUEROS BOOTCUT RELAXED FIT - ÍNDIGO | COS ES", "cos", "VAQUEROS BOOTCUT RELAXED FIT - ÍNDIGO"],
    ["Levi's Workwear Vaqueros holgados, Hombre, Talla: 30x32, Blue denim", "zalando", "Levi's Workwear Vaqueros holgados, Hombre, Blue denim"],
    ["Camisa | Edición limitada", "zara", "Camisa | Edición limitada"],
  ])("%s", (titulo, idTienda, esperado) => {
    expect(limpiarTitulo(titulo, tienda(idTienda))).toBe(esperado);
  });
});
