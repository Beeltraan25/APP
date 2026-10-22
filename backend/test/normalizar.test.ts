import { describe, expect, it } from "vitest";
import { comprobarPrenda, gramajeDesdeGsm, normalizarFicha, normalizarHex } from "../src/analisis/normalizar";
import { FichaPrenda } from "../src/esquemas/ficha";
import { fichaIAEjemplo } from "./ayudas";

describe("normalizarHex", () => {
  it.each([
    ["#4a4a4a", "#4A4A4A"],
    ["4A4A4A", "#4A4A4A"],
    ["#abc", "#AABBCC"],
    [" #ffffff ", "#FFFFFF"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarHex(entrada)).toBe(esperado);
  });

  it("rechaza colores no válidos", () => {
    expect(normalizarHex("gris")).toBeNull();
    expect(normalizarHex("#12345")).toBeNull();
  });
});

describe("gramajeDesdeGsm", () => {
  it("aplica los cortes ligero < 180, medio 180–300, pesado > 300", () => {
    expect(gramajeDesdeGsm(179)).toBe("ligero");
    expect(gramajeDesdeGsm(180)).toBe("medio");
    expect(gramajeDesdeGsm(300)).toBe("medio");
    expect(gramajeDesdeGsm(301)).toBe("pesado");
  });
});

describe("normalizarFicha", () => {
  it("devuelve una ficha válida para la app", () => {
    const ficha = normalizarFicha(fichaIAEjemplo(), "pagina");
    expect(() => FichaPrenda.parse(ficha)).not.toThrow();
    expect(ficha.publico).toBe("hombre");
    expect(ficha.categoria).toBe("sudadera");
    expect(ficha.color_principal).toEqual({ nombre: "gris marengo", hex: "#4A4A4A" });
    expect(ficha.composicion).toEqual([{ fibra: "algodón", porcentaje: 100 }]);
  });

  it("calcula el gramaje estimado a partir de los g/m² aunque la IA diga otra cosa", () => {
    const ficha = normalizarFicha({ ...fichaIAEjemplo(), gramaje_gsm: 380, gramaje_estimado: "medio" }, "pagina");
    expect(ficha.gramaje_estimado).toBe("pesado");
  });

  it("quita detalles repetidos", () => {
    const ficha = normalizarFicha(fichaIAEjemplo(), "pagina");
    expect(ficha.detalles).toEqual(["hombros caídos", "bolsillo canguro"]);
  });

  it("en una foto marca material y gramaje como estimados", () => {
    const ficha = normalizarFicha(fichaIAEjemplo(), "foto");
    expect(ficha.campos_estimados).toEqual(
      expect.arrayContaining(["material", "composicion", "gramaje_gsm", "gramaje_estimado"]),
    );
  });

  it("en una página respeta lo que la IA ha marcado como estimado", () => {
    const ficha = normalizarFicha({ ...fichaIAEjemplo(), campos_estimados: ["fit"] }, "pagina");
    expect(ficha.campos_estimados).toEqual(["fit"]);
  });

  it("si el color no es válido usa un gris y lo marca como estimado", () => {
    const ficha = normalizarFicha({ ...fichaIAEjemplo(), color_principal: { nombre: "gris", hex: "gris" } }, "pagina");
    expect(ficha.color_principal.hex).toBe("#808080");
    expect(ficha.campos_estimados).toContain("color_principal");
  });

  it("si no hay palabras clave crea una búsqueda básica", () => {
    const ficha = normalizarFicha({ ...fichaIAEjemplo(), palabras_clave_busqueda: [" "] }, "pagina");
    expect(ficha.palabras_clave_busqueda).toEqual(["sudadera gris marengo hombre"]);
  });
});

describe("comprobarPrenda", () => {
  it("rechaza fotos sin prenda", () => {
    expect(() => comprobarPrenda({ ...fichaIAEjemplo(), prenda_detectada: false })).toThrow(/ninguna prenda/);
  });

  it("rechaza ropa de mujer mientras la app sea solo de hombre", () => {
    expect(() => comprobarPrenda({ ...fichaIAEjemplo(), publico_detectado: "mujer" })).toThrow(/solo busca ropa de hombre/);
  });

  it("acepta prendas unisex", () => {
    expect(() => comprobarPrenda({ ...fichaIAEjemplo(), publico_detectado: "unisex" })).not.toThrow();
  });
});
