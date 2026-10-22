import { z } from "zod";

/**
 * Para validar lo que envía la app: los campos que admiten null pueden faltar.
 * Swift (JSONEncoder) omite las claves con valor nil en vez de enviar null; sin esto,
 * una ficha con "cuello": nil se rechazaría.
 */
export function ausentesComoNull<T extends z.ZodObject>(esquema: T) {
  return z.preprocess((valor) => {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return valor;
    const copia: Record<string, unknown> = { ...valor };
    for (const [clave, campo] of Object.entries(esquema.shape)) {
      if (!(clave in copia) && (campo as z.ZodType).safeParse(null).success) copia[clave] = null;
    }
    return copia;
  }, esquema);
}
