import { describe, expect, it } from "vitest";
import { formatearPrecio, parsearImporte, parsearPrecio, rangoDePrecio } from "../src/busqueda/precios";

describe("parsearImporte", () => {
  it.each([
    ["29,95", 2995],
    ["29.95", 2995],
    ["29", 2900],
    ["29,9", 2990],
    ["1.299,00", 129900],
    ["1,299.00", 129900],
    ["1.299", 129900],
    ["1 299,00 €", 129900],
    ["€29.95", 2995],
    ["Antes 39,95 € ahora 29,95 €", 3995],
    ["29,95 39,95", 2995],
  ])("%s → %i céntimos", (texto, esperado) => {
    expect(parsearImporte(texto)).toBe(esperado);
  });

  it("devuelve null si no hay cifras", () => {
    expect(parsearImporte("Agotado")).toBeNull();
  });
});

describe("parsearPrecio", () => {
  it("detecta euros escritos de varias formas", () => {
    expect(parsearPrecio("29,95 EUR")).toEqual({ centimos: 2995, moneda: "EUR" });
    expect(parsearPrecio("29,95 €")).toEqual({ centimos: 2995, moneda: "EUR" });
  });

  it("usa la moneda por defecto si el texto no la dice", () => {
    expect(parsearPrecio("29,95", "eur")).toEqual({ centimos: 2995, moneda: "EUR" });
  });

  it("devuelve null si no se sabe la moneda", () => {
    expect(parsearPrecio("29,95")).toBeNull();
  });

  it("reconoce otras monedas (para poder descartarlas)", () => {
    expect(parsearPrecio("$29.95")?.moneda).toBe("USD");
  });
});

describe("rangoDePrecio", () => {
  it.each([
    [2499, "economico"],
    [2500, "medio"],
    [6000, "medio"],
    [6001, "alto"],
    [15000, "alto"],
    [15001, "premium"],
  ])("%i céntimos → %s", (centimos, rango) => {
    expect(rangoDePrecio(centimos)).toBe(rango);
  });
});

describe("formatearPrecio", () => {
  it("usa el formato español", () => {
    expect(formatearPrecio({ centimos: 1299, moneda: "EUR" }).replace(/\s/g, " ")).toBe("12,99 €");
  });
});
