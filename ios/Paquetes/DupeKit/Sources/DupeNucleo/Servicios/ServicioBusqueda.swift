import Foundation

/// Busca alternativas a una prenda en las tiendas de la lista blanca.
public protocol ServicioBusqueda: Sendable {
    func buscar(imagenUrl: URL?, ficha: FichaPrenda, precioOriginal: Int?) async throws -> RespuestaBusqueda
    /// Más prendas del mismo rollo, a partir de referencias de Pinterest.
    func inspiracion(ficha: FichaPrenda, imagenUrl: URL?, precioOriginal: Int?, excluir: [String]) async throws -> RespuestaInspiracion
}

extension ServicioBusqueda {
    /// Sin precio de la prenda: alternativas de cualquier precio.
    public func buscar(imagenUrl: URL?, ficha: FichaPrenda) async throws -> RespuestaBusqueda {
        try await buscar(imagenUrl: imagenUrl, ficha: ficha, precioOriginal: nil)
    }

    /// Por defecto no hay inspiración (p. ej. en servicios de prueba que solo buscan).
    public func inspiracion(ficha: FichaPrenda, imagenUrl: URL?, precioOriginal: Int?, excluir: [String]) async throws -> RespuestaInspiracion {
        throw ErrorApp.desconocido
    }
}

/// Datos de prueba: sirve para diseñar sin gastar búsquedas de SerpAPI.
public struct ServicioBusquedaSimulado: ServicioBusqueda {
    public var retraso: Duration

    public init(retraso: Duration = .milliseconds(1500)) {
        self.retraso = retraso
    }

    public func buscar(imagenUrl: URL?, ficha: FichaPrenda, precioOriginal: Int?) async throws -> RespuestaBusqueda {
        if retraso > .zero {
            try await Task.sleep(for: retraso)
        }
        return DatosSimulados.busqueda
    }

    public func inspiracion(ficha: FichaPrenda, imagenUrl: URL?, precioOriginal: Int?, excluir: [String]) async throws -> RespuestaInspiracion {
        if retraso > .zero {
            try await Task.sleep(for: retraso)
        }
        return DatosSimulados.inspiracion
    }
}

/// Búsqueda real en el backend (Google Lens + Google Shopping vía SerpAPI).
public struct ServicioBusquedaRemoto: ServicioBusqueda {
    private let cliente: ClienteAPI

    public init(cliente: ClienteAPI) {
        self.cliente = cliente
    }

    public func buscar(imagenUrl: URL?, ficha: FichaPrenda, precioOriginal: Int?) async throws -> RespuestaBusqueda {
        try await cliente.buscar(imagenUrl: imagenUrl, ficha: ficha, precioOriginal: precioOriginal)
    }

    public func inspiracion(ficha: FichaPrenda, imagenUrl: URL?, precioOriginal: Int?, excluir: [String]) async throws -> RespuestaInspiracion {
        try await cliente.inspiracion(ficha: ficha, imagenUrl: imagenUrl, precioOriginal: precioOriginal, excluir: excluir)
    }
}
