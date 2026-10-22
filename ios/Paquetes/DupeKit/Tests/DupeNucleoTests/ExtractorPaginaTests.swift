import Foundation
import Testing
@testable import DupeNucleo

@Suite("Lectura de páginas de producto")
struct ExtractorPaginaTests {
    let url = URL(string: "https://www.zara.com/es/es/sudadera-capucha-p01234.html?v1=555")!

    let paginaProducto = """
        <!doctype html><html><head>
        <title>Sudadera &amp; capucha | ZARA España</title>
        <meta property="og:title" content="SUDADERA CAPUCHA HEAVYWEIGHT">
        <meta content="//static.zara.net/foto.jpg?w=750" property="og:image" />
        <meta name="description" content="Sudadera de cuello con capucha &#233;pica y bolsillo canguro.">
        <meta property="product:price:amount" content="29.95">
        <meta property="product:price:currency" content="EUR">
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[
            {"@type":"BreadcrumbList","name":"Migas"},
            {"@type":"Product","name":"SUDADERA","material":"100% algodón",
             "offers":{"@type":"Offer","price":"29.95","priceCurrency":"EUR"}}
          ]}
        </script>
        </head><body></body></html>
        """

    /// Lo que devuelve Zara a una descarga sin JavaScript (verificación de Akamai).
    let paginaVerificacion = """
        <!DOCTYPE html><html><head><meta charset="utf-8">
        <meta http-equiv="refresh" content="5; URL='/es/es/x.html?bm-verify=AAQ'" />
        <title>&nbsp;</title></head>
        <body><iframe src="/interstitial/ic.html"></iframe></body></html>
        """

    @Test("Lee título, imagen, precio, descripción y JSON-LD")
    func paginaDeProducto() {
        let pagina = ExtractorPagina.extraer(html: paginaProducto, url: url)
        #expect(pagina.titulo == "SUDADERA CAPUCHA HEAVYWEIGHT")
        #expect(pagina.imagenUrl?.absoluteString == "https://static.zara.net/foto.jpg?w=750")
        #expect(pagina.precioTexto == "29.95 EUR")
        #expect(pagina.descripcion == "Sudadera de cuello con capucha épica y bolsillo canguro.")
        #expect(pagina.jsonLd?["name"]?.texto == "SUDADERA")
        #expect(pagina.jsonLd?["offers"]?["priceCurrency"]?.texto == "EUR")
        #expect(pagina.esUtil)
    }

    @Test("Una página de verificación anti-bots no se considera útil")
    func paginaDeVerificacion() {
        let pagina = ExtractorPagina.extraer(html: paginaVerificacion, url: url)
        #expect(pagina.titulo == nil)
        #expect(!pagina.esUtil)
    }

    @Test("Sin og:title usa el <title> de la página")
    func tituloDeRespaldo() {
        let html = "<html><head><title>Camisa Oxford &amp; Co</title></head></html>"
        #expect(ExtractorPagina.extraer(html: html, url: url).titulo == "Camisa Oxford & Co")
    }

    @Test("Las imágenes http pasan a https y las relativas se completan")
    func urlsDeImagen() {
        let base = URL(string: "https://shop.mango.com/es/p/1")!
        #expect(ExtractorPagina.urlSegura("http://img.mango.com/a.jpg", base: base)?.absoluteString == "https://img.mango.com/a.jpg")
        #expect(ExtractorPagina.urlSegura("/img/a.jpg", base: base)?.absoluteString == "https://shop.mango.com/img/a.jpg")
        #expect(ExtractorPagina.urlSegura("data:image/png;base64,AAA", base: base) == nil)
    }

    @Test("Al enviarla, el JSON-LD conserva sus claves originales")
    func codificacion() throws {
        let pagina = ExtractorPagina.extraer(html: paginaProducto, url: url)
        let json = String(decoding: try JSONEncoder().encode(pagina), as: UTF8.self)
        #expect(json.contains("\"imagen_url\""))
        #expect(json.contains("\"precio_texto\""))
        #expect(json.contains("\"json_ld\""))
        #expect(json.contains("\"priceCurrency\""))
        #expect(!json.contains("price_currency"))
    }
}

@Suite("Configuración del servidor")
struct ConfiguracionAPITests {
    @Test("Sin URL o sin clave, no hay configuración (datos de prueba)")
    func incompleta() {
        #expect(ConfiguracionAPI.desde(infoPlist: [:]) == nil)
        #expect(ConfiguracionAPI.desde(infoPlist: ["URL_BACKEND": "", "CLAVE_APP": "x"]) == nil)
        #expect(ConfiguracionAPI.desde(infoPlist: ["URL_BACKEND": "$(URL_BACKEND)", "CLAVE_APP": "x"]) == nil)
        #expect(ConfiguracionAPI.desde(infoPlist: ["URL_BACKEND": "http://127.0.0.1:8787", "CLAVE_APP": " "]) == nil)
    }

    @Test("Con URL y clave, se usa el backend")
    func completa() {
        let configuracion = ConfiguracionAPI.desde(infoPlist: ["URL_BACKEND": "http://127.0.0.1:8787", "CLAVE_APP": "secreta"])
        #expect(configuracion?.urlBase.absoluteString == "http://127.0.0.1:8787")
        #expect(configuracion?.claveApp == "secreta")
    }
}
