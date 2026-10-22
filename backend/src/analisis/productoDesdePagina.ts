import { dominioDeUrl, tiendaDeUrl } from "../busqueda/listaBlanca";
import { parsearPrecio, rangoDePrecio } from "../busqueda/precios";
import type { DatosPagina } from "../esquemas/pagina";
import type { ProductoOrigen } from "../esquemas/producto";
import { sha256Hex, textoONull } from "../infra/utilidades";
import type { DatosJsonLd } from "./jsonLd";

/** Construye la prenda original a partir de los datos de su página. Solo se aceptan precios en euros. */
export async function productoDesdePagina(
  pagina: DatosPagina,
  jsonLd: DatosJsonLd | null,
  urlLimpia: string,
): Promise<ProductoOrigen> {
  const tiendaConfig = tiendaDeUrl(urlLimpia);
  const dominio = dominioDeUrl(urlLimpia) ?? "tienda";
  const tienda = tiendaConfig ? { id: tiendaConfig.id, nombre: tiendaConfig.nombre } : { id: dominio, nombre: dominio };

  const precioDelTexto = pagina.precio_texto ? parsearPrecio(pagina.precio_texto, jsonLd?.precio?.moneda ?? null) : null;
  const precioCualquiera = jsonLd?.precio ?? precioDelTexto;
  const precio = precioCualquiera?.moneda === "EUR" ? precioCualquiera : null;

  return {
    id: `prd_${(await sha256Hex(urlLimpia)).slice(0, 16)}`,
    titulo: textoONull(pagina.titulo) ?? jsonLd?.nombre ?? "Prenda",
    tienda,
    marca: jsonLd?.marca ?? (tiendaConfig && !tiendaConfig.multimarca ? tiendaConfig.nombre : null),
    url: urlLimpia,
    imagen_url: pagina.imagen_url ?? jsonLd?.imagen ?? null,
    precio,
    precio_anterior: null,
    rango: precio ? rangoDePrecio(precio.centimos) : null,
  };
}
