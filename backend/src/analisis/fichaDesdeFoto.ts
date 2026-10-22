import { FichaIA, type FichaPrenda } from "../esquemas/ficha";
import { INSTRUCCIONES_FICHA, PROMPT_FOTO } from "../ia/prompts";
import type { ProveedorIA } from "../ia/proveedor";
import type { TipoImagen } from "../infra/imagenes";
import { aBase64 } from "../infra/utilidades";
import { comprobarPrenda, normalizarFicha } from "./normalizar";

/** Foto → IA con visión → ficha técnica. */
export async function fichaDesdeFoto(
  ia: ProveedorIA,
  imagen: { bytes: Uint8Array; tipo: TipoImagen },
): Promise<FichaPrenda> {
  const resultado = await ia.generarJSON({
    instrucciones: INSTRUCCIONES_FICHA,
    partes: [
      { tipo: "texto", texto: PROMPT_FOTO },
      { tipo: "imagen", base64: aBase64(imagen.bytes), mime: imagen.tipo },
    ],
    esquema: FichaIA,
  });
  comprobarPrenda(resultado);
  return normalizarFicha(resultado, "foto");
}
