import Foundation

/// Respuesta de POST /v1/analizar.
public struct RespuestaAnalisis: Codable, Hashable, Sendable {
    public var analisisId: String
    /// URL pública de la imagen para Google Lens (la foto guardada 24 h o la de la tienda).
    public var imagenUrl: URL?
    /// Solo cuando se analiza un enlace.
    public var productoOrigen: ProductoOrigen?
    public var ficha: FichaPrenda
}

/// Lo que el usuario quiere analizar.
public enum EntradaAnalisis: Sendable, Hashable {
    /// Foto ya reducida (JPEG de ~1024 px).
    case foto(Data)
    case enlace(URL)
    /// Datos ya leídos de la página (p. ej. desde Safari en la Share Extension).
    case pagina(DatosPagina)
}

/// Estado de una carga, para pintar placeholder / resultado / error.
public enum EstadoCarga<Valor: Sendable>: Sendable {
    case inactivo
    case cargando
    case listo(Valor)
    case error(ErrorApp)

    public var valor: Valor? {
        switch self {
        case .listo(let valor): valor
        default: nil
        }
    }

    public var estaCargando: Bool {
        switch self {
        case .cargando: true
        default: false
        }
    }
}
