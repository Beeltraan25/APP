import type { z } from "zod";

export type ParteEntrada =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagen"; base64: string; mime: string };

export interface PeticionJSON<T> {
  /** Instrucciones de sistema: el papel de la IA y las reglas. */
  instrucciones: string;
  /** Texto e imágenes de la petición, en orden. */
  partes: ParteEntrada[];
  /** La respuesta debe cumplir este esquema; se envía a la IA y se valida al recibirla. */
  esquema: z.ZodType<T>;
}

/**
 * Cualquier IA que sepa devolver JSON con un esquema. Hoy es Gemini; si algún día se quiere
 * usar Claude u otra, basta con añadir otra implementación de esta interfaz.
 */
export interface ProveedorIA {
  generarJSON<T>(peticion: PeticionJSON<T>): Promise<T>;
}
