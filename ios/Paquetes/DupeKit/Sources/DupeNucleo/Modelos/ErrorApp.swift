import Foundation

/// Error tal como lo envía el backend: { "error": { "codigo", "mensaje", "detalle"? } }
public struct ErrorAPI: Codable, Hashable, Sendable {
    public var codigo: String
    public var mensaje: String
    public var detalle: String?

    public init(codigo: String, mensaje: String, detalle: String? = nil) {
        self.codigo = codigo
        self.mensaje = mensaje
        self.detalle = detalle
    }
}

/// Errores que ve el usuario, siempre con un mensaje amable en español.
public enum ErrorApp: Error, Hashable, Sendable, LocalizedError {
    case servidor(ErrorAPI)
    case sinConexion
    case respuestaNoValida
    case desconocido

    public var mensaje: String {
        switch self {
        case .servidor(let error): error.mensaje
        case .sinConexion: "Parece que no hay conexión. Revisa tu internet y vuelve a intentarlo."
        case .respuestaNoValida: "Hemos recibido una respuesta inesperada. Inténtalo de nuevo."
        case .desconocido: "Algo ha fallado. Inténtalo de nuevo."
        }
    }

    public var errorDescription: String? { mensaje }
}
