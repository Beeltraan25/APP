import { parsearImporte } from "../busqueda/precios";
import type { Precio } from "../esquemas/producto";
import { textoONull } from "../infra/utilidades";

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** Busca el nodo Product (o ProductGroup) en un JSON-LD, que puede venir como lista o con @graph. */
export function buscarProductoJsonLd(jsonLd: unknown, profundidad = 0): Objeto | null {
  if (profundidad > 5 || jsonLd == null) return null;
  if (Array.isArray(jsonLd)) {
    for (const elemento of jsonLd) {
      const producto = buscarProductoJsonLd(elemento, profundidad + 1);
      if (producto) return producto;
    }
    return null;
  }
  if (!esObjeto(jsonLd)) return null;
  const tipos = [jsonLd["@type"]].flat();
  if (tipos.includes("Product") || tipos.includes("ProductGroup")) return jsonLd;
  return buscarProductoJsonLd(jsonLd["@graph"], profundidad + 1);
}

export interface DatosJsonLd {
  nombre: string | null;
  marca: string | null;
  imagen: string | null;
  material: string | null;
  color: string | null;
  descripcion: string | null;
  /** Solo si la tienda indica la moneda. */
  precio: Precio | null;
}

/** Extrae los campos útiles de un nodo Product de schema.org. */
export function leerProductoJsonLd(producto: Objeto): DatosJsonLd {
  const marca = producto.brand;
  return {
    nombre: texto(producto.name),
    marca: esObjeto(marca) ? texto(marca.name) : texto(marca),
    imagen: primeraImagen(producto.image),
    material: texto(producto.material),
    color: texto(producto.color),
    descripcion: texto(producto.description)?.slice(0, 2000) ?? null,
    precio: precioDeOfertas(producto.offers) ?? precioDeVariantes(producto.hasVariant),
  };
}

function texto(valor: unknown): string | null {
  if (typeof valor === "string") return textoONull(valor);
  if (typeof valor === "number") return String(valor);
  if (Array.isArray(valor)) return textoONull(valor.filter((v) => typeof v === "string").join(", "));
  return null;
}

/** La imagen puede ser un texto, una lista o un objeto ImageObject. Solo se aceptan URLs https. */
function primeraImagen(valor: unknown): string | null {
  const candidata = [valor].flat()[0];
  const url = typeof candidata === "string" ? candidata : esObjeto(candidata) ? texto(candidata.url) : null;
  if (!url) return null;
  const absoluta = url.startsWith("//") ? `https:${url}` : url;
  return absoluta.startsWith("https://") ? absoluta : null;
}

/** offers puede ser un objeto o una lista, con price, lowPrice o priceSpecification. */
function precioDeOfertas(ofertas: unknown): Precio | null {
  for (const oferta of [ofertas].flat()) {
    if (!esObjeto(oferta)) continue;
    const especificacion = esObjeto(oferta.priceSpecification) ? oferta.priceSpecification : {};
    const importe = oferta.price ?? oferta.lowPrice ?? especificacion.price;
    const moneda = texto(oferta.priceCurrency) ?? texto(especificacion.priceCurrency);
    const centimos =
      typeof importe === "number" ? Math.round(importe * 100) : typeof importe === "string" ? parsearImporte(importe) : null;
    if (centimos !== null && moneda) return { centimos, moneda: moneda.toUpperCase() };
  }
  return null;
}

/** En un ProductGroup, el precio suele estar en las variantes. */
function precioDeVariantes(variantes: unknown): Precio | null {
  for (const variante of [variantes].flat()) {
    if (esObjeto(variante)) {
      const precio = precioDeOfertas(variante.offers);
      if (precio) return precio;
    }
  }
  return null;
}
