import { tiendaDeUrl } from "../busqueda/listaBlanca";
import { rangoDePrecio } from "../busqueda/precios";
import type { Candidato } from "../busqueda/serpapi";
import type { FichaPrenda } from "../esquemas/ficha";
import type { ProductoOrigen } from "../esquemas/producto";
import type { ProveedorIA } from "../ia/proveedor";
import type { TipoImagen } from "../infra/imagenes";
import { limpiarUrl } from "../infra/utilidades";
import { fichaDesdePagina } from "./fichaDesdePagina";
import { buscarProductoJsonLd, leerProductoJsonLd } from "./jsonLd";
import { completarPaginaDesdeServidor, paginaVacia } from "./leerPaginaServidor";
import { productoDesdePagina } from "./productoDesdePagina";

/** Cuántos resultados de Google Lens se le enseñan a la IA para que reconozca la prenda. */
export const MAXIMO_COINCIDENCIAS = 10;

/** ¿Es de una tienda conocida (aunque no esté activa)? Solo de esas merece la pena leer la página. */
export function esDeTiendaConocida(candidato: Candidato): boolean {
  return candidato.fuente === "lens" && tiendaDeUrl(candidato.url) !== null;
}

/**
 * La IA ha reconocido la prenda exacta en una tienda: se lee su página para copiar los datos
 * reales (material, composición, precio…). La ficha resultante mantiene el color de la foto,
 * porque la página puede mostrar otra variante de color del mismo modelo.
 * Si la página no se puede leer, al menos se devuelve el producto con lo que dio Google Lens.
 */
export async function completarConTienda(
  ia: ProveedorIA,
  candidato: Candidato,
  fichaFoto: FichaPrenda,
  foto: { bytes: Uint8Array; tipo: TipoImagen },
  f?: typeof fetch,
): Promise<{ ficha: FichaPrenda; producto: ProductoOrigen }> {
  const url = limpiarUrl(candidato.url);
  const precioLens = candidato.precio?.moneda === "EUR" ? candidato.precio : null;
  const conPrecioLens = (producto: ProductoOrigen): ProductoOrigen =>
    producto.precio || !precioLens ? producto : { ...producto, precio: precioLens, rango: rangoDePrecio(precioLens.centimos) };

  const pagina = await completarPaginaDesdeServidor({ url }, f);
  if (!paginaVacia(pagina)) {
    const nodo = buscarProductoJsonLd(pagina.json_ld);
    const jsonLd = nodo ? leerProductoJsonLd(nodo) : null;
    const producto = conPrecioLens(await productoDesdePagina(pagina, jsonLd, url));
    try {
      const fichaTienda = await fichaDesdePagina(ia, {
        pagina,
        jsonLd,
        jsonLdTexto: nodo ? JSON.stringify(nodo).slice(0, 3000) : null,
        producto,
        imagen: foto,
      });
      return {
        ficha: { ...fichaTienda, color_principal: fichaFoto.color_principal, colores_secundarios: fichaFoto.colores_secundarios },
        producto,
      };
    } catch (error) {
      console.warn("No se pudo completar la ficha con la tienda", error);
      return { ficha: fichaFoto, producto };
    }
  }

  const producto = conPrecioLens(
    await productoDesdePagina({ url, titulo: candidato.titulo, imagen_url: candidato.imagen }, null, url),
  );
  return { ficha: fichaFoto, producto };
}
