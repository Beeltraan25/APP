import Foundation

/// Análisis real: fotos y enlaces van al backend (Gemini).
/// Los enlaces se leen antes en el iPhone, porque las tiendas bloquean a los servidores.
public struct ServicioAnalisisRemoto: ServicioAnalisis {
    private let cliente: ClienteAPI
    private let lector: any LectorPaginas

    public init(cliente: ClienteAPI, lector: any LectorPaginas) {
        self.cliente = cliente
        self.lector = lector
    }

    public func analizar(_ entrada: EntradaAnalisis) async throws -> RespuestaAnalisis {
        switch entrada {
        case .foto(let foto):
            return try await cliente.analizar(foto: foto)
        case .enlace(let url):
            let pagina = await lector.leer(url)
            return try await cliente.analizar(pagina: pagina)
        case .pagina(let pagina):
            return try await cliente.analizar(pagina: pagina)
        }
    }
}
