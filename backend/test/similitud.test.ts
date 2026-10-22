import { describe, expect, it, vi } from "vitest";
import { normalizarFicha } from "../src/analisis/normalizar";
import type { Alternativa } from "../src/esquemas/busqueda";
import type { PeticionJSON, ProveedorIA } from "../src/ia/proveedor";
import {
  fibrasDeFicha,
  puntuacionDetalles,
  puntuacionFit,
  puntuacionGramaje,
  puntuacionMaterial,
} from "../src/similitud/atributos";
import { deltaE2000, hexALab, puntuacionColor } from "../src/similitud/color";
import { coseno, dichoDeHombre, evaluarAlternativas, puntuacionVisual } from "../src/similitud/evaluarAlternativas";
import { combinar, crearEtiquetas, PESOS } from "../src/similitud/puntuar";
import { fichaIAEjemplo, JPEG_MINIMO, KVSimulado } from "./ayudas";

const ficha = normalizarFicha(fichaIAEjemplo(), "pagina");

describe("color", () => {
  it("CIEDE2000 da los valores de referencia de Sharma et al.", () => {
    expect(deltaE2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 3);
    expect(deltaE2000({ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 })).toBeCloseTo(2.3669, 3);
    expect(deltaE2000({ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 })).toBeCloseTo(27.1492, 3);
  });

  it("convierte hexadecimal a Lab", () => {
    expect(hexALab("#FFFFFF")?.L).toBeCloseTo(100, 1);
    expect(hexALab("#000000")?.L).toBeCloseTo(0, 1);
    expect(hexALab("gris")).toBeNull();
  });

  it("puntúa el color según la diferencia", () => {
    expect(puntuacionColor(1)).toBe(100);
    expect(puntuacionColor(12)).toBe(70);
    expect(puntuacionColor(50)).toBe(0);
    const grisOscuro = hexALab("#4A4A4A")!;
    expect(puntuacionColor(deltaE2000(grisOscuro, hexALab("#4D4D4D")!))).toBeGreaterThan(95);
    // Gris oscuro frente a rojo: ΔE ≈ 29 → muy poca puntuación.
    expect(puntuacionColor(deltaE2000(grisOscuro, hexALab("#C8102E")!))).toBeLessThan(25);
  });
});

describe("puntuaciones por criterio", () => {
  it("visual: coseno calibrado a 0–100", () => {
    expect(coseno([1, 0], [1, 0])).toBeCloseTo(1);
    expect(coseno([1, 0], [0, 1])).toBeCloseTo(0);
    expect(puntuacionVisual(0.9)).toBe(100);
    expect(puntuacionVisual(0.55)).toBe(0);
    expect(puntuacionVisual(0.725)).toBe(50);
  });

  it("gramaje y fit por cercanía; sin dato, null", () => {
    expect(puntuacionGramaje("pesado", "pesado")).toBe(100);
    expect(puntuacionGramaje("pesado", "medio")).toBe(50);
    expect(puntuacionGramaje("pesado", "ligero")).toBe(0);
    expect(puntuacionGramaje(null, "medio")).toBeNull();
    expect(puntuacionFit("oversize", "relajado")).toBe(60);
    expect(puntuacionFit("oversize", "ajustado")).toBe(0);
    expect(puntuacionFit("otro", "regular")).toBeNull();
  });

  it("material: la fibra principal manda", () => {
    expect(puntuacionMaterial(["algodon"], ["Algodón"])).toBe(100);
    expect(puntuacionMaterial(["algodon", "elastano"], ["cotton"])).toBe(85);
    expect(puntuacionMaterial(["algodon"], ["poliéster"])).toBe(0);
    expect(puntuacionMaterial(["algodon"], [])).toBeNull();
  });

  it("las fibras de la ficha salen de la composición o, si no hay, del material", () => {
    expect(fibrasDeFicha(ficha)).toEqual(["algodon"]);
    expect(fibrasDeFicha({ ...ficha, composicion: [], material: "denim de algodón y elastano" })).toEqual(["algodon", "elastano"]);
    expect(fibrasDeFicha({ ...ficha, composicion: [], material: null })).toEqual([]);
  });

  it("detalles: proporción de los de la original que tiene la candidata", () => {
    expect(puntuacionDetalles(["a", "b"], ["a"])).toBe(50);
    expect(puntuacionDetalles(["a", "b"], ["a", "a", "zzz"])).toBe(50);
    expect(puntuacionDetalles([], ["a"])).toBeNull();
  });
});

describe("combinar", () => {
  const todas = { visual: 80, color: 100, gramaje: 50, material: 100, fit: 60, detalles: 50 };

  it("aplica los pesos de la especificación", () => {
    const resultado = combinar(todas)!;
    // 80·0,35 + 100·0,2 + 50·0,15 + 100·0,1 + 60·0,1 + 50·0,1 = 76,5
    expect(resultado.total).toBe(77);
    expect(resultado.criterios.every((c) => c.disponible)).toBe(true);
  });

  it("si falta un dato, reparte su peso y lo marca como no disponible", () => {
    const resultado = combinar({ ...todas, gramaje: null })!;
    const gramaje = resultado.criterios.find((c) => c.criterio === "gramaje")!;
    expect(gramaje).toMatchObject({ disponible: false, puntuacion: null, peso_aplicado: 0 });
    const suma = resultado.criterios.reduce((s, c) => s + c.peso_aplicado, 0);
    expect(suma).toBeCloseTo(1, 2);
    // (28 + 20 + 10 + 6 + 5) / 0,85 = 81,2
    expect(resultado.total).toBe(81);
  });

  it("sin ningún dato no hay similitud", () => {
    expect(combinar({ visual: null, color: null, gramaje: null, material: null, fit: null, detalles: null })).toBeNull();
  });

  it("otro tipo de prenda puntúa la mitad", () => {
    expect(combinar(todas, false)!.total).toBe(38);
  });

  it("los pesos suman 1", () => {
    expect(Object.values(PESOS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("etiquetas", () => {
  const base = { mismaPrenda: true, deltaE: 3, gramaje: "pesado" as const, fit: "oversize" as const, mismoMaterial: true, detallesPresentes: [] };

  it("como mucho 3, de la más a la menos importante", () => {
    expect(crearEtiquetas(ficha, base).map((e) => e.texto)).toEqual(["Mismo color", "Mismo gramaje", "Mismo corte"]);
  });

  it("describe las diferencias", () => {
    const etiquetas = crearEtiquetas(ficha, { ...base, deltaE: 40, gramaje: "ligero", fit: "regular" });
    expect(etiquetas).toEqual([
      { texto: "Otro color", tipo: "diferencia" },
      { texto: "Tejido más ligero", tipo: "diferencia" },
      { texto: "Corte más ajustado", tipo: "diferencia" },
    ]);
  });

  it("otro tipo de prenda va primero; un detalle compartido antes que 'mismo material'", () => {
    const etiquetas = crearEtiquetas(ficha, {
      ...base,
      mismaPrenda: false,
      deltaE: 15,
      gramaje: null,
      fit: null,
      detallesPresentes: ["bolsillo canguro"],
    });
    expect(etiquetas.map((e) => e.texto)).toEqual(["Otro tipo de prenda", "Con bolsillo canguro", "Mismo material"]);
  });

  it("un material distinto sí se antepone a los detalles", () => {
    const etiquetas = crearEtiquetas(ficha, {
      ...base,
      deltaE: 15,
      gramaje: null,
      fit: null,
      mismoMaterial: false,
      detallesPresentes: ["bolsillo canguro"],
    });
    expect(etiquetas.map((e) => e.texto)).toEqual(["Otro material", "Con bolsillo canguro"]);
  });
});

describe("evaluarAlternativas", () => {
  const idImagen = "an_0123456789abcdef01234567";

  function alternativa(id: string, titulo: string): Alternativa {
    return {
      producto: {
        id,
        titulo,
        tienda: { id: "zara", nombre: "Zara" },
        marca: "Zara",
        url: `https://www.zara.com/es/${id}.html`,
        imagen_url: null,
        precio: { centimos: 2995, moneda: "EUR" },
        precio_anterior: null,
        rango: "medio",
      },
      similitud: null,
      etiquetas: [],
      fuente: "lens",
    };
  }

  class IAFalsa implements ProveedorIA {
    constructor(
      private readonly vectores: number[][] | null,
      private readonly atributos: unknown,
    ) {}
    peticionAtributos: PeticionJSON<unknown> | null = null;
    async embeberImagenes() {
      if (!this.vectores) throw new Error("sin embeddings");
      return this.vectores;
    }
    async generarJSON<T>(peticion: PeticionJSON<T>): Promise<T> {
      this.peticionAtributos = peticion as PeticionJSON<unknown>;
      if (!this.atributos) throw new Error("sin atributos");
      return peticion.esquema.parse(this.atributos);
    }
  }

  async function preparar(ia: ProveedorIA) {
    const kv = new KVSimulado();
    await kv.put(idImagen, JPEG_MINIMO, { metadata: { tipo: "image/jpeg" } });
    const fetchImagenes = vi.fn<typeof fetch>(async () => new Response(JPEG_MINIMO));
    return evaluarAlternativas({
      ia,
      ficha,
      alternativas: [alternativa("a", "Sudadera roja"), alternativa("b", "Sudadera gris oversize")],
      miniaturas: ["https://img/a.jpg", "https://img/b.jpg"],
      imagenUrl: `https://dupe.test/v1/imagenes/${idImagen}`,
      kvImagenes: kv as unknown as KVNamespace,
      fetchImagenes,
    });
  }

  const atributos = {
    prendas: [
      { indice: 0, misma_prenda: true, publico: "hombre", color: { nombre: "rojo", hex: "#C8102E" }, fibras: ["algodón"], gramaje_estimado: "medio", fit: "regular", detalles_presentes: [] },
      { indice: 1, misma_prenda: true, publico: "hombre", color: { nombre: "gris", hex: "#4A4A4A" }, fibras: ["algodón"], gramaje_estimado: "pesado", fit: "oversize", detalles_presentes: ["hombros caídos", "bolsillo canguro"] },
    ],
  };

  it("ordena de más a menos parecida y pone etiquetas", async () => {
    // Original [1,0]; "a" perpendicular (nada parecida); "b" igual.
    const ia = new IAFalsa([[1, 0], [0, 1], [1, 0]], atributos);
    const resultado = await preparar(ia);
    expect(resultado.map((a) => a.producto.id)).toEqual(["b", "a"]);
    expect(resultado[0]?.similitud?.total).toBe(100);
    expect(resultado[0]?.etiquetas.map((e) => e.texto)).toEqual(["Mismo color", "Mismo gramaje", "Mismo corte"]);
    expect(resultado[1]?.etiquetas[0]).toEqual({ texto: "Otro color", tipo: "diferencia" });
  });

  it("envía a la IA la foto original y la de cada candidata, con los detalles para elegir", async () => {
    const ia = new IAFalsa([[1, 0], [0, 1], [1, 0]], atributos);
    await preparar(ia);
    const partes = ia.peticionAtributos!.partes;
    expect(partes.filter((p) => p.tipo === "imagen")).toHaveLength(3);
    expect(partes.some((p) => p.tipo === "texto" && p.texto.includes("Candidata 1: Sudadera gris oversize (Zara)"))).toBe(true);
  });

  it("si la tienda dice que es de hombre, no se descarta aunque la IA diga lo contrario", () => {
    expect(dichoDeHombre("Calvin Klein Hombres Baggy Jeans", "https://www.google.es/search?prds=1")).toBe(true);
    expect(dichoDeHombre("Baggy Jeans", "https://www2.hm.com/es_es/productpage.men.123.html")).toBe(true);
    expect(dichoDeHombre("Jeans barrel tiro bajo", "https://www.pullandbear.com/es/jeans-barrel-tiro-bajo-l1")).toBe(false);
    expect(dichoDeHombre("Vaqueros mangas", "https://www.tienda.com/x")).toBe(false);
  });

  it("descarta lo que la IA ve claramente de mujer", async () => {
    const conMujer = {
      prendas: [{ ...atributos.prendas[0]!, publico: "mujer" }, atributos.prendas[1]!],
    };
    const resultado = await preparar(new IAFalsa([[1, 0], [0, 1], [1, 0]], conMujer));
    expect(resultado.map((a) => a.producto.id)).toEqual(["b"]);
  });

  it("si fallan los atributos, puntúa solo con lo visual", async () => {
    const resultado = await preparar(new IAFalsa([[1, 0], [0, 1], [1, 0]], null));
    const b = resultado.find((a) => a.producto.id === "b")!;
    expect(b.similitud?.total).toBe(100);
    expect(b.similitud?.criterios.filter((c) => c.disponible).map((c) => c.criterio)).toEqual(["visual"]);
    expect(b.etiquetas).toEqual([]);
  });

  it("si falla todo, devuelve las alternativas sin similitud y en su orden", async () => {
    const resultado = await preparar(new IAFalsa(null, null));
    expect(resultado.map((a) => a.producto.id)).toEqual(["a", "b"]);
    expect(resultado.every((a) => a.similitud === null)).toBe(true);
  });
});
