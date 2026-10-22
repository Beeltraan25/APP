import { describe, expect, it } from "vitest";
import { buscarProductoJsonLd, leerProductoJsonLd } from "../src/analisis/jsonLd";
import { dominioDeUrl, tiendaDeUrl } from "../src/busqueda/listaBlanca";
import { limpiarUrl } from "../src/infra/utilidades";

describe("tiendaDeUrl", () => {
  it("reconoce tiendas por dominio y subdominio", () => {
    expect(tiendaDeUrl("https://www.zara.com/es/es/sudadera-p123.html")?.id).toBe("zara");
    expect(tiendaDeUrl("https://shop.mango.com/es/hombre/sudaderas")?.id).toBe("mango");
    expect(tiendaDeUrl("https://www2.hm.com/es_es/productpage.123.html")?.id).toBe("hm");
  });

  it("no confunde dominios que solo se parecen", () => {
    expect(tiendaDeUrl("https://notzara.com/producto")).toBeNull();
    expect(tiendaDeUrl("https://zara.com.estafa.net/producto")).toBeNull();
  });

  it("puede ignorar las tiendas desactivadas", () => {
    expect(tiendaDeUrl("https://www.oysho.com/es/x")?.id).toBe("oysho");
    expect(tiendaDeUrl("https://www.oysho.com/es/x", { soloActivas: true })).toBeNull();
  });

  it("dominioDeUrl quita www", () => {
    expect(dominioDeUrl("https://WWW.Zalando.es/x")).toBe("zalando.es");
  });
});

describe("limpiarUrl", () => {
  it("quita fragmento y seguimiento pero conserva el color", () => {
    expect(limpiarUrl("https://www.zara.com/es/es/sudadera-p1.html?v1=123&utm_source=ig#fotos")).toBe(
      "https://www.zara.com/es/es/sudadera-p1.html?v1=123",
    );
  });
});

describe("JSON-LD", () => {
  const producto = {
    "@type": "Product",
    name: "SUDADERA CAPUCHA HEAVYWEIGHT",
    brand: { "@type": "Brand", name: "ZARA" },
    image: ["//static.zara.net/foto.jpg"],
    material: "100% algodón",
    color: "Gris marengo",
    offers: { "@type": "Offer", price: "29.95", priceCurrency: "EUR" },
  };

  it("encuentra el producto dentro de @graph o de una lista", () => {
    expect(buscarProductoJsonLd({ "@graph": [{ "@type": "BreadcrumbList" }, producto] })).toBe(producto);
    expect(buscarProductoJsonLd([{ "@type": "Organization" }, producto])).toBe(producto);
    expect(buscarProductoJsonLd({ "@type": "WebPage" })).toBeNull();
  });

  it("extrae nombre, marca, imagen https, material y precio", () => {
    expect(leerProductoJsonLd(producto)).toEqual({
      nombre: "SUDADERA CAPUCHA HEAVYWEIGHT",
      marca: "ZARA",
      imagen: "https://static.zara.net/foto.jpg",
      material: "100% algodón",
      color: "Gris marengo",
      descripcion: null,
      precio: { centimos: 2995, moneda: "EUR" },
    });
  });

  it("lee el precio de las variantes de un ProductGroup", () => {
    const grupo = { "@type": "ProductGroup", hasVariant: [{ offers: [{ price: 39.9, priceCurrency: "EUR" }] }] };
    expect(leerProductoJsonLd(grupo).precio).toEqual({ centimos: 3990, moneda: "EUR" });
  });
});
