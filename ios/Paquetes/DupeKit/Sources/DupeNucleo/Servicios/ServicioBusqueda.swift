import Foundation

/// Busca alternativas a una prenda en las tiendas de la lista blanca.
public protocol ServicioBusqueda: Sendable {
    func buscar(imagenUrl: URL?, ficha: FichaPrenda) async throws -> RespuestaBusqueda
}

/// Datos de prueba: sirve para diseñar sin gastar búsquedas de SerpAPI.
public struct ServicioBusquedaSimulado: ServicioBusqueda {
    public var retraso: Duration

    public init(retraso: Duration = .milliseconds(1500)) {
        self.retraso = retraso
    }

    public func buscar(imagenUrl: URL?, ficha: FichaPrenda) async throws -> RespuestaBusqueda {
        if retraso > .zero {
            try await Task.sleep(for: retraso)
        }
        return DatosSimulados.busqueda
    }
}

/// Búsqueda real en el backend (Google Lens + Google Shopping vía SerpAPI).
public struct ServicioBusquedaRemoto: ServicioBusqueda {
    private let cliente: ClienteAPI

    public init(cliente: ClienteAPI) {
        self.cliente = cliente
    }

    public func buscar(imagenUrl: URL?, ficha: FichaPrenda) async throws -> RespuestaBusqueda {
        try await cliente.buscar(imagenUrl: imagenUrl, ficha: ficha)
    }
}
