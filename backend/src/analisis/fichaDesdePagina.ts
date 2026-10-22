import { formatearPrecio } from "../busqueda/precios";
import { FichaIA, type FichaPrenda } from "../esquemas/ficha";
import type { DatosPagina } from "../esquemas/pagina";
import type { ProductoOrigen } from "../esquemas/producto";
import { INSTRUCCIONES_FICHA, promptPagina } from "../ia/prompts";
import type { ParteEntrada, ProveedorIA } from "../ia/proveedor";
import type { TipoImagen } from "../infra/imagenes";
import { aBase64 } from "../infra/utilidades";
import type { DatosJsonLd } from "./jsonLd";
import { comprobarPrenda, normalizarFicha } from "./normalizar";

export interface EntradaPagina {
  pagina: DatosPagina;
  jsonLd: DatosJsonLd | null;
  /** El nodo Product completo, recortado, para dar contexto a la IA. */
  jsonLdTexto: string | null;
  producto: ProductoOrigen;
  /** La imagen de la tienda si se pudo descargar. */
  imagen: { bytes: Uint8Array; tipo: TipoImagen } | null;
}

/** Datos de la página (+ su imagen si la hay) → IA → ficha técnica. */
export async function fichaDesdePagina(ia: ProveedorIA, entrada: EntradaPagina): Promise<FichaPrenda> {
  const { pagina, jsonLd, jsonLdTexto, producto, imagen } = entrada;

  const partes: ParteEntrada[] = [
    {
      tipo: "texto",
      texto: promptPagina({
        url: producto.url,
        tienda: producto.tienda.nombre,
        titulo: producto.titulo,
        precio: producto.precio ? formatearPrecio(producto.precio) : (pagina.precio_texto ?? null),
        descripcion: pagina.descripcion ?? jsonLd?.descripcion ?? null,
        material: jsonLd?.material ?? null,
        color: jsonLd?.color ?? null,
        jsonLd: jsonLdTexto,
        conImagen: imagen !== null,
      }),
    },
  ];
  if (imagen) partes.push({ tipo: "imagen", base64: aBase64(imagen.bytes), mime: imagen.tipo });

  const resultado = await ia.generarJSON({ instrucciones: INSTRUCCIONES_FICHA, partes, esquema: FichaIA });
  comprobarPrenda(resultado);
  return normalizarFicha(resultado, "pagina");
}
