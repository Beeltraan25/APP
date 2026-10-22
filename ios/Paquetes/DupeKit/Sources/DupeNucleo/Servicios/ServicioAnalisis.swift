import Foundation

/// Analiza una prenda (foto o enlace) y devuelve su ficha técnica.
/// Hay una versión simulada (datos de prueba) y, en la fase 2, una remota que llama al backend.
public protocol ServicioAnalisis: Sendable {
    func analizar(_ entrada: EntradaAnalisis) async throws -> RespuestaAnalisis
}

/// Devuelve siempre los datos de prueba: sirve para diseñar sin gastar cuota de IA.
public struct ServicioAnalisisSimulado: ServicioAnalisis {
    public var retraso: Duration

    public init(retraso: Duration = .milliseconds(1200)) {
        self.retraso = retraso
    }

    public func analizar(_ entrada: EntradaAnalisis) async throws -> RespuestaAnalisis {
        if retraso > .zero {
            try await Task.sleep(for: retraso)
        }
        switch entrada {
        case .foto: return DatosSimulados.analisisFoto
        case .enlace, .pagina: return DatosSimulados.analisisEnlace
        }
    }
}
