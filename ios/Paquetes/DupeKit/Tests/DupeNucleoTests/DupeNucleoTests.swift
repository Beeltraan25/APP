import Foundation
import Testing
@testable import DupeNucleo

@Suite("Respuestas del backend")
struct DecodificacionTests {
    @Test("Lee la respuesta real de una foto")
    func respuestaDeUnaFoto() {
        let respuesta = DatosSimulados.analisisFoto
        let ficha = respuesta.ficha
        #expect(ficha.categoria == "vaqueros")
        #expect(ficha.colorPrincipal.hex == "#1B2A4A")
        #expect(ficha.gramajeEstimado == .pesado)
        #expect(ficha.fit == .oversize)
        #expect(ficha.publico == .hombre)
        #expect(ficha.cuello == nil)
        #expect(ficha.camposEstimados.contains("material"))
        #expect(respuesta.productoOrigen == nil)
    }

    @Test("Lee la prenda original de un enlace")
    func respuestaDeUnEnlace() throws {
        let origen = try #require(DatosSimulados.analisisEnlace.productoOrigen)
        #expect(origen.tienda.nombre == "Zara")
        #expect(origen.precio?.centimos == 2995)
        #expect(origen.rango == .medio)
        #expect(origen.url.host() == "www.zara.com")
    }

    @Test("Lee una búsqueda real, puntuada y ordenada por parecido")
    func busqueda() throws {
        let busqueda = DatosSimulados.busqueda
        #expect(busqueda.alternativas.count == 16)
        #expect(busqueda.conteoPorRango["economico"] == 1)
        #expect(busqueda.conteoPorRango["premium"] == 0)
        #expect(busqueda.alternativas.allSatisfy { RangoPrecio.para(centimos: $0.producto.precio.centimos) == $0.producto.rango })

        let totales = busqueda.alternativas.compactMap { $0.similitud?.total }
        #expect(totales.count == 16)
        #expect(totales == totales.sorted(by: >))

        let cos = try #require(busqueda.alternativas.first { $0.producto.tienda.id == "cos" })
        #expect(cos.similitud?.criterios.count == 6)
        #expect(cos.similitud?.criterios.first?.titulo == "Aspecto")
        #expect(cos.etiquetas.count == 3)
        #expect(!cos.abreGoogleShopping)
        #expect(busqueda.alternativas.contains { $0.abreGoogleShopping })
    }

    @Test("Un fit desconocido se lee como «otro»")
    func fitDesconocido() throws {
        let valores = try JSONDecoder().decode([Fit].self, from: Data(#"["slim", "regular"]"#.utf8))
        #expect(valores == [.otro, .regular])
    }

    @Test("Textos de composición y gramaje")
    func textosDeLaFicha() {
        let ficha = DatosSimulados.analisisFoto.ficha
        #expect(ficha.composicionTexto == "100 % algodón")
        #expect(ficha.gramajeTexto == "Pesado · 350 g/m²")
    }
}

@Suite("Precios")
struct PrecioTests {
    @Test("Formato español")
    func formatoEspanol() {
        let texto = Precio(centimos: 1299).formateado
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .replacingOccurrences(of: "\u{202F}", with: " ")
        #expect(texto == "12,99 €")
    }

    @Test("Rangos de precio", arguments: [
        (2499, RangoPrecio.economico),
        (2500, RangoPrecio.medio),
        (6000, RangoPrecio.medio),
        (6001, RangoPrecio.alto),
        (15000, RangoPrecio.alto),
        (15001, RangoPrecio.premium),
    ])
    func rangos(centimos: Int, esperado: RangoPrecio) {
        #expect(RangoPrecio.para(centimos: centimos) == esperado)
    }
}

@Suite("Enlaces")
struct EnlaceTests {
    @Test("Encuentra el enlace dentro de un texto compartido")
    func enlaceEnTexto() {
        let url = ExtractorEnlace.primerEnlace(en: "Mira esta sudadera https://www.zara.com/es/es/x.html?v1=2 😍")
        #expect(url?.host() == "www.zara.com")
    }

    @Test("Sin enlace devuelve nil")
    func sinEnlace() {
        #expect(ExtractorEnlace.primerEnlace(en: "hola, ¿qué tal?") == nil)
    }
}
