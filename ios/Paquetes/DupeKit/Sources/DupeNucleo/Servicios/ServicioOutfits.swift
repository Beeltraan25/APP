import Foundation

/// Genera outfits alrededor de una prenda y propone otras opciones para una pieza.
public protocol ServicioOutfits: Sendable {
    /// `progreso` recibe mensajes como "Analizando el estilo…" mientras se generan (20–60 s).
    func generar(
        base: PrendaBase,
        estilo: String,
        presupuesto: PresupuestoPorPrenda,
        progreso: @escaping @Sendable (String) async -> Void
    ) async throws -> RespuestaOutfits

    func cambiarPieza(consulta: String, presupuesto: PresupuestoPorPrenda, excluir: [String]) async throws -> [Producto]
}

/// Datos de prueba: unos outfits "old money" reales para los vaqueros de la foto.
public struct ServicioOutfitsSimulado: ServicioOutfits {
    public var retraso: Duration

    public init(retraso: Duration = .milliseconds(900)) {
        self.retraso = retraso
    }

    public func generar(
        base: PrendaBase,
        estilo: String,
        presupuesto: PresupuestoPorPrenda,
        progreso: @escaping @Sendable (String) async -> Void
    ) async throws -> RespuestaOutfits {
        for mensaje in ["Buscando referencias de \(estilo)…", "Analizando el estilo…", "Diseñando los outfits…", "Buscando las piezas en las tiendas…"] {
            await progreso(mensaje)
            if retraso > .zero { try await Task.sleep(for: retraso) }
        }
        return DatosSimulados.outfits
    }

    public func cambiarPieza(consulta: String, presupuesto: PresupuestoPorPrenda, excluir: [String]) async throws -> [Producto] {
        if retraso > .zero { try await Task.sleep(for: retraso) }
        let limite = presupuesto.centimos ?? .max
        let opciones = DatosSimulados.busqueda.alternativas
            .map(\.producto)
            .filter { producto in !excluir.contains(producto.id) && producto.precio.centimos <= limite }
        return Array(opciones.prefix(6))
    }
}

/// Outfits reales desde el backend.
public struct ServicioOutfitsRemoto: ServicioOutfits {
    private let cliente: ClienteAPI

    public init(cliente: ClienteAPI) {
        self.cliente = cliente
    }

    public func generar(
        base: PrendaBase,
        estilo: String,
        presupuesto: PresupuestoPorPrenda,
        progreso: @escaping @Sendable (String) async -> Void
    ) async throws -> RespuestaOutfits {
        try await cliente.outfits(base: base, estilo: estilo, presupuesto: presupuesto, progreso: progreso)
    }

    public func cambiarPieza(consulta: String, presupuesto: PresupuestoPorPrenda, excluir: [String]) async throws -> [Producto] {
        try await cliente.cambiarPieza(consulta: consulta, presupuesto: presupuesto, excluir: excluir)
    }
}
