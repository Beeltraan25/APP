import { z } from "zod";

const recortar = (maximo: number) => (texto: string) => texto.trim().slice(0, maximo);

/**
 * Datos de la página de un producto. Los extrae el iPhone (o la Share Extension desde Safari)
 * para que las tiendas no bloqueen la descarga, como suelen hacer con los servidores.
 */
export const DatosPagina = z.object({
  url: z.url({ protocol: /^https?$/ }),
  titulo: z.string().transform(recortar(300)).nullish(),
  // Si la URL de la imagen no es válida, se ignora en vez de rechazar toda la petición.
  imagen_url: z.url({ protocol: /^https$/ }).nullish().catch(null),
  precio_texto: z.string().transform(recortar(60)).nullish(),
  descripcion: z.string().transform(recortar(4000)).nullish(),
  json_ld: z.unknown().optional(),
});
export type DatosPagina = z.infer<typeof DatosPagina>;

export const PeticionAnalisisPagina = z.object({ pagina: DatosPagina });
