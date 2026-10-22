import { CAMPOS_ESTIMABLES, type CampoEstimable, type FichaIA, type FichaPrenda } from "../esquemas/ficha";
import { Errores } from "../infra/errores";
import { textoONull } from "../infra/utilidades";

const GRIS_NEUTRO = "#808080";

/** Corta el análisis si no hay prenda o si es de mujer (por ahora la app es solo de hombre). */
export function comprobarPrenda(ficha: FichaIA) {
  if (!ficha.prenda_detectada) throw Errores.prendaNoDetectada();
  if (ficha.publico_detectado === "mujer") throw Errores.soloHombre();
}

/** "#4a4a4a", "4A4A4A" o "#abc" → "#4A4A4A". Null si no es un color válido. */
export function normalizarHex(hex: string): string | null {
  const limpio = hex.trim().replace(/^#?/, "#").toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(limpio)) return limpio;
  if (/^#[0-9A-F]{3}$/.test(limpio)) {
    return `#${[...limpio.slice(1)].map((cifra) => cifra + cifra).join("")}`;
  }
  return null;
}

/** ligero < 180 g/m² · medio 180–300 · pesado > 300 */
export function gramajeDesdeGsm(gsm: number): "ligero" | "medio" | "pesado" {
  if (gsm < 180) return "ligero";
  if (gsm <= 300) return "medio";
  return "pesado";
}

/**
 * Convierte la respuesta de la IA en la ficha que recibe la app: limpia textos, valida colores,
 * deduce el gramaje estimado a partir de los g/m² y marca qué datos son estimaciones.
 */
export function normalizarFicha(ia: FichaIA, origen: "foto" | "pagina"): FichaPrenda {
  const estimados = new Set<CampoEstimable>(ia.campos_estimados);

  const hexPrincipal = normalizarHex(ia.color_principal.hex);
  if (!hexPrincipal) estimados.add("color_principal");
  const colorPrincipal = {
    nombre: textoONull(ia.color_principal.nombre)?.toLowerCase() ?? "sin determinar",
    hex: hexPrincipal ?? GRIS_NEUTRO,
  };

  const coloresSecundarios = ia.colores_secundarios
    .flatMap((color) => {
      const hex = normalizarHex(color.hex);
      const nombre = textoONull(color.nombre)?.toLowerCase();
      return hex && nombre ? [{ nombre, hex }] : [];
    })
    .slice(0, 4);

  const composicion = ia.composicion.flatMap((fibra) => {
    const nombre = textoONull(fibra.fibra)?.toLowerCase();
    return nombre && fibra.porcentaje > 0 ? [{ fibra: nombre, porcentaje: fibra.porcentaje }] : [];
  });

  const categoria = textoONull(ia.categoria)?.toLowerCase() ?? "prenda";
  const gramajeGsm = ia.gramaje_gsm;

  const ficha: FichaPrenda = {
    categoria,
    subcategoria: textoONull(ia.subcategoria),
    color_principal: colorPrincipal,
    colores_secundarios: coloresSecundarios,
    estampado: textoONull(ia.estampado) ?? "liso",
    material: textoONull(ia.material),
    composicion,
    gramaje_gsm: gramajeGsm,
    // Si se conocen los g/m², manda el dato y no la impresión de la IA.
    gramaje_estimado: gramajeGsm !== null ? gramajeDesdeGsm(gramajeGsm) : ia.gramaje_estimado,
    fit: ia.fit,
    largo: textoONull(ia.largo),
    cuello: textoONull(ia.cuello),
    mangas: textoONull(ia.mangas),
    cierres: textoONull(ia.cierres),
    detalles: sinRepetidos(ia.detalles).slice(0, 8),
    acabado: textoONull(ia.acabado),
    palabras_clave_busqueda: palabrasClave(ia.palabras_clave_busqueda, categoria, colorPrincipal.nombre),
    campos_estimados: [],
    publico: "hombre",
  };

  // En una foto no se puede leer la etiqueta: material y gramaje siempre son estimaciones.
  if (origen === "foto") {
    if (ficha.material) estimados.add("material");
    if (ficha.composicion.length) estimados.add("composicion");
    if (ficha.gramaje_gsm !== null) estimados.add("gramaje_gsm");
    if (ficha.gramaje_estimado) estimados.add("gramaje_estimado");
  }
  ficha.campos_estimados = CAMPOS_ESTIMABLES.filter((campo) => estimados.has(campo));

  return ficha;
}

function sinRepetidos(textos: string[]): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const texto of textos) {
    const limpio = textoONull(texto);
    if (!limpio || vistos.has(limpio.toLowerCase())) continue;
    vistos.add(limpio.toLowerCase());
    resultado.push(limpio);
  }
  return resultado;
}

function palabrasClave(propuestas: string[], categoria: string, color: string): string[] {
  const lista = sinRepetidos(propuestas.map((p) => p.toLowerCase())).slice(0, 5);
  return lista.length ? lista : [`${categoria} ${color} hombre`];
}
