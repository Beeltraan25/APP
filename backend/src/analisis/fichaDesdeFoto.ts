import { z } from "zod";
import { FichaIA, type FichaPrenda } from "../esquemas/ficha";
import { INSTRUCCIONES_FICHA, PROMPT_FOTO, promptCoincidencias } from "../ia/prompts";
import type { ParteEntrada, ProveedorIA } from "../ia/proveedor";
import type { TipoImagen } from "../infra/imagenes";
import { aBase64 } from "../infra/utilidades";
import { comprobarPrenda, normalizarFicha } from "./normalizar";

/** Un resultado de Google Lens que podría ser la misma prenda. */
export interface PosibleCoincidencia {
  titulo: string;
  tienda: string | null;
}

/** La ficha de la IA más, si la hay, qué resultado de Google Lens es exactamente esta prenda. */
export const FichaIAConCoincidencia = FichaIA.extend({
  coincidencia: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Número del resultado de Google Lens que es exactamente esta misma prenda (misma marca, modelo y color); null si ninguno lo es con seguridad"),
});

/** Foto (+ resultados de Google Lens si los hay) → IA con visión → ficha técnica. */
export async function fichaDesdeFoto(
  ia: ProveedorIA,
  imagen: { bytes: Uint8Array; tipo: TipoImagen },
  coincidencias: PosibleCoincidencia[] = [],
): Promise<{ ficha: FichaPrenda; coincidencia: number | null }> {
  const partes: ParteEntrada[] = [
    { tipo: "texto", texto: PROMPT_FOTO },
    { tipo: "imagen", base64: aBase64(imagen.bytes), mime: imagen.tipo },
  ];
  if (coincidencias.length) partes.push({ tipo: "texto", texto: promptCoincidencias(coincidencias) });

  const resultado = await ia.generarJSON({
    instrucciones: INSTRUCCIONES_FICHA,
    partes,
    esquema: FichaIAConCoincidencia,
  });
  comprobarPrenda(resultado);
  const indice = resultado.coincidencia ?? null;
  return {
    ficha: normalizarFicha(resultado, "foto"),
    coincidencia: indice !== null && indice >= 0 && indice < coincidencias.length ? indice : null,
  };
}
