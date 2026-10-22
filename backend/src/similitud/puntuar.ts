import type { CriterioSimilitud, Etiqueta, Similitud } from "../esquemas/busqueda";
import type { FichaPrenda } from "../esquemas/ficha";
import type { z } from "zod";

type Criterio = z.infer<typeof CriterioSimilitud>["criterio"];
type Etiqueta_ = z.infer<typeof Etiqueta>;
type Similitud_ = z.infer<typeof Similitud>;

/** Pesos de la especificación: visual 35 · color 20 · gramaje 15 · material 10 · fit 10 · detalles 10. */
export const PESOS: Record<Criterio, number> = {
  visual: 0.35,
  color: 0.2,
  gramaje: 0.15,
  material: 0.1,
  fit: 0.1,
  detalles: 0.1,
};

/** Si la IA dice que es otro tipo de prenda (bermuda frente a vaqueros), la puntuación se reduce a la mitad. */
export const PENALIZACION_OTRA_PRENDA = 0.5;

/**
 * Combina las puntuaciones. Si falta un dato, su peso se reparte entre los que sí hay
 * (proporcionalmente) y se marca como no disponible. Sin ningún dato, no hay similitud.
 */
export function combinar(puntuaciones: Record<Criterio, number | null>, mismaPrenda = true): Similitud_ | null {
  const criterios = Object.keys(PESOS) as Criterio[];
  const pesoDisponible = criterios.reduce((suma, c) => suma + (puntuaciones[c] === null ? 0 : PESOS[c]), 0);
  if (pesoDisponible === 0) return null;

  const detalle = criterios.map((criterio) => {
    const puntuacion = puntuaciones[criterio];
    const disponible = puntuacion !== null;
    return {
      criterio,
      peso_base: PESOS[criterio],
      peso_aplicado: disponible ? Math.round((PESOS[criterio] / pesoDisponible) * 1000) / 1000 : 0,
      puntuacion: disponible ? Math.round(puntuacion) : null,
      disponible,
    };
  });

  const total = detalle.reduce((suma, c) => suma + (c.puntuacion ?? 0) * (PESOS[c.criterio] / pesoDisponible), 0);
  return {
    total: Math.round(Math.min(100, Math.max(0, total * (mismaPrenda ? 1 : PENALIZACION_OTRA_PRENDA)))),
    criterios: detalle,
  };
}

const ORDEN_GRAMAJE = { ligero: 0, medio: 1, pesado: 2 } as const;
const ORDEN_FIT = { ajustado: 0, regular: 1, relajado: 2, oversize: 3 } as const;

export interface DatosEtiquetas {
  mismaPrenda: boolean;
  deltaE: number | null;
  gramaje: FichaPrenda["gramaje_estimado"];
  fit: FichaPrenda["fit"];
  /** null si no se sabe; true si coincide la fibra principal. */
  mismoMaterial: boolean | null;
  detallesPresentes: string[];
}

/** Hasta 3 etiquetas cortas, de la más a la menos importante. */
export function crearEtiquetas(ficha: FichaPrenda, datos: DatosEtiquetas): Etiqueta_[] {
  const etiquetas: (Etiqueta_ | null)[] = [];

  if (!datos.mismaPrenda) etiquetas.push({ texto: "Otro tipo de prenda", tipo: "diferencia" });

  if (datos.deltaE !== null) {
    if (datos.deltaE <= 8) etiquetas.push({ texto: "Mismo color", tipo: "coincide" });
    else if (datos.deltaE >= 25) etiquetas.push({ texto: "Otro color", tipo: "diferencia" });
  }

  if (ficha.gramaje_estimado && datos.gramaje) {
    const diferencia = ORDEN_GRAMAJE[datos.gramaje] - ORDEN_GRAMAJE[ficha.gramaje_estimado];
    etiquetas.push(
      diferencia === 0
        ? { texto: "Mismo gramaje", tipo: "coincide" }
        : { texto: diferencia < 0 ? "Tejido más ligero" : "Tejido más grueso", tipo: "diferencia" },
    );
  }

  if (ficha.fit && datos.fit && ficha.fit !== "otro" && datos.fit !== "otro") {
    const diferencia = ORDEN_FIT[datos.fit] - ORDEN_FIT[ficha.fit];
    etiquetas.push(
      diferencia === 0
        ? { texto: "Mismo corte", tipo: "coincide" }
        : { texto: diferencia < 0 ? "Corte más ajustado" : "Corte más holgado", tipo: "diferencia" },
    );
  }

  const detalle = datos.detallesPresentes[0];
  if (detalle) etiquetas.push({ texto: `Con ${detalle}`, tipo: "coincide" });

  // El material va al final: en muchas prendas coincide siempre (vaqueros = algodón) y aporta poco.
  // Un material distinto sí es útil, así que ese se antepone a los detalles.
  if (datos.mismoMaterial === false) {
    etiquetas.splice(etiquetas.length - (detalle ? 1 : 0), 0, { texto: "Otro material", tipo: "diferencia" });
  } else if (datos.mismoMaterial) {
    etiquetas.push({ texto: "Mismo material", tipo: "coincide" });
  }

  return etiquetas.filter((e): e is Etiqueta_ => e !== null).slice(0, 3);
}
