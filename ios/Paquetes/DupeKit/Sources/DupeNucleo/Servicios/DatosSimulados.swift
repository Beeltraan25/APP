import Foundation

/// Respuestas del backend guardadas como JSON, para previews, tests y la fase 1.
public enum DatosSimulados {
    /// Decodificador con el mismo formato que usa el backend (snake_case).
    public static func decodificador() -> JSONDecoder {
        let decodificador = JSONDecoder()
        decodificador.keyDecodingStrategy = .convertFromSnakeCase
        return decodificador
    }

    public static func cargar<T: Decodable>(_ nombre: String, como tipo: T.Type = T.self) throws -> T {
        guard let url = Bundle.module.url(forResource: nombre, withExtension: "json") else {
            throw ErrorApp.respuestaNoValida
        }
        return try decodificador().decode(tipo, from: Data(contentsOf: url))
    }

    /// Respuesta real del backend para la foto de unos vaqueros (analizada con Gemini).
    public static var analisisFoto: RespuestaAnalisis {
        // swiftlint:disable:next force_try
        try! cargar("analisis-foto")
    }

    /// Alternativas a los vaqueros de la foto, en los cuatro rangos de precio.
    public static var busqueda: RespuestaBusqueda {
        // swiftlint:disable:next force_try
        try! cargar("busqueda")
    }

    /// Respuesta del backend para el enlace de una sudadera de Zara.
    public static var analisisEnlace: RespuestaAnalisis {
        // swiftlint:disable:next force_try
        try! cargar("analisis-enlace")
    }
}
