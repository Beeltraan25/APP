import Foundation

/// Una foto de referencia de Pinterest.
public struct ReferenciaPinterest: Codable, Hashable, Sendable, Identifiable {
    public var imagen: URL
    public var titulo: String?
    /// Página del pin.
    public var enlace: URL?

    public var id: URL { imagen }
}

/// Una idea de prenda del mismo rollo, con productos reales de las tiendas.
public struct IdeaInspiracion: Codable, Hashable, Sendable, Identifiable {
    public var titulo: String
    public var consulta: String
    public var productos: [Producto]

    public var id: String { consulta }
}

/// Respuesta de POST /v1/inspiracion: el «rollo» de la prenda según Pinterest y más prendas de ese estilo.
public struct RespuestaInspiracion: Codable, Hashable, Sendable {
    public var rollo: String
    public var referencias: [ReferenciaPinterest]
    public var ideas: [IdeaInspiracion]
    public var desdeCache: Bool
}
