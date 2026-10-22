import DupeCompartir
import Foundation
import Testing
@testable import DupeNucleo

@Suite("Share Extension")
@MainActor
struct CompartirTests {
    let url = URL(string: "https://www.zara.com/es/es/sudadera-p01234.html")!

    @Test("Desde Safari se usa la página ya cargada si tiene datos de producto")
    func paginaSafariConDatos() {
        let html = """
            <html><head><meta property="og:image" content="https://static.zara.net/foto.jpg">
            <script type="application/ld+json">{"@type":"Product","name":"SUDADERA"}</script></head></html>
            """
        guard case .pagina(let pagina) = EntradaCompartida.paginaSafari(url: url, html: html).entradaAnalisis else {
            Issue.record("Debería analizar la página de Safari")
            return
        }
        #expect(pagina.imagenUrl?.absoluteString == "https://static.zara.net/foto.jpg")
    }

    @Test("Si la página de Safari no sirve, se lee el enlace")
    func paginaSafariSinDatos() {
        let entrada = EntradaCompartida.paginaSafari(url: url, html: "<html><title>Un momento…</title></html>")
        #expect(entrada.entradaAnalisis == .enlace(url))
    }

    @Test("Un texto con enlace se analiza; sin enlace no")
    func texto() {
        #expect(EntradaCompartida.texto("Mira esta \(url.absoluteString) 😍").entradaAnalisis == .enlace(url))
        #expect(EntradaCompartida.texto("hola").entradaAnalisis == nil)
    }

    @Test("Analiza, busca y se queda con las mejores alternativas")
    func procesarFoto() async {
        let modelo = ModeloCompartir(servicios: .simulados(retraso: .zero))
        await modelo.procesar(.foto(Data([0xFF, 0xD8])))
        guard case .listo(_, _, let alternativas) = modelo.fase else {
            Issue.record("Debería terminar con resultados")
            return
        }
        #expect(!alternativas.isEmpty)
        #expect(alternativas.count <= ModeloCompartir.maximoAlternativas)
        #expect(modelo.modoPrueba)
    }

    @Test("Sin nada útil muestra un error amable")
    func sinEntrada() async {
        let modelo = ModeloCompartir(servicios: .simulados(retraso: .zero))
        await modelo.procesar(.texto("sin enlace"))
        guard case .error(let mensaje) = modelo.fase else {
            Issue.record("Debería mostrar un error")
            return
        }
        #expect(mensaje.contains("foto"))
    }
}
