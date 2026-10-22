import Foundation

/// Lee los datos del producto de un enlace. Nunca falla: si no puede, devuelve solo la URL
/// y el backend pedirá amablemente una captura de pantalla.
public protocol LectorPaginas: Sendable {
    func leer(_ url: URL) async -> DatosPagina
}

/// Descarga normal con URLSession, como la haría Safari en el iPhone.
/// Rápida, pero algunas tiendas (Zara, Mango…) responden con una verificación anti-bots:
/// en ese caso la app prueba con un navegador invisible.
public struct LectorPaginasHTTP: LectorPaginas {
    static let agenteSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"

    private let sesion: URLSession

    public init(sesion: URLSession = .shared) {
        self.sesion = sesion
    }

    public func leer(_ url: URL) async -> DatosPagina {
        var peticion = URLRequest(url: url, timeoutInterval: 15)
        peticion.setValue(Self.agenteSafari, forHTTPHeaderField: "User-Agent")
        peticion.setValue("es-ES,es;q=0.9", forHTTPHeaderField: "Accept-Language")
        peticion.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")

        guard let resultado = try? await sesion.data(for: peticion),
              let http = resultado.1 as? HTTPURLResponse,
              (200..<300).contains(http.statusCode)
        else { return DatosPagina(url: url) }

        let html = String(decoding: resultado.0.prefix(3_000_000), as: UTF8.self)
        let pagina = ExtractorPagina.extraer(html: html, url: http.url ?? url)
        // Una página de verificación no sirve: mejor no enviar su título al backend.
        return pagina.esUtil ? pagina : DatosPagina(url: url)
    }
}
