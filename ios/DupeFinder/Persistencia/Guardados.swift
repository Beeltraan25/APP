import Foundation
import SwiftData

/// Copia de una alternativa guardada: se ve aunque el producto desaparezca de la tienda.
@Model
final class PrendaGuardada {
    #Unique<PrendaGuardada>([\.productoId])

    var productoId: String
    var titulo: String
    var tiendaNombre: String
    var marca: String?
    var url: URL
    var imagenUrl: URL?
    var precioCentimos: Int
    var similitud: Int?
    var etiquetas: [String]
    /// FichaPrenda en JSON, para poder "buscar otra vez".
    var fichaOrigen: Data?
    var fechaGuardado: Date

    init(
        productoId: String,
        titulo: String,
        tiendaNombre: String,
        marca: String? = nil,
        url: URL,
        imagenUrl: URL? = nil,
        precioCentimos: Int,
        similitud: Int? = nil,
        etiquetas: [String] = [],
        fichaOrigen: Data? = nil,
        fechaGuardado: Date = .now
    ) {
        self.productoId = productoId
        self.titulo = titulo
        self.tiendaNombre = tiendaNombre
        self.marca = marca
        self.url = url
        self.imagenUrl = imagenUrl
        self.precioCentimos = precioCentimos
        self.similitud = similitud
        self.etiquetas = etiquetas
        self.fichaOrigen = fichaOrigen
        self.fechaGuardado = fechaGuardado
    }
}

@Model
final class OutfitGuardado {
    var estilo: String
    var porQueEncaja: String
    var precioTotalCentimos: Int
    var fechaGuardado: Date
    @Relationship(deleteRule: .cascade, inverse: \PiezaGuardada.outfit)
    var piezas: [PiezaGuardada] = []

    init(estilo: String, porQueEncaja: String, precioTotalCentimos: Int, fechaGuardado: Date = .now) {
        self.estilo = estilo
        self.porQueEncaja = porQueEncaja
        self.precioTotalCentimos = precioTotalCentimos
        self.fechaGuardado = fechaGuardado
    }
}

@Model
final class PiezaGuardada {
    var orden: Int
    var rol: String
    var esPrendaBase: Bool
    var productoId: String
    var titulo: String
    var tiendaNombre: String
    var url: URL
    var imagenUrl: URL?
    var precioCentimos: Int
    var outfit: OutfitGuardado?

    init(
        orden: Int,
        rol: String,
        esPrendaBase: Bool,
        productoId: String,
        titulo: String,
        tiendaNombre: String,
        url: URL,
        imagenUrl: URL? = nil,
        precioCentimos: Int
    ) {
        self.orden = orden
        self.rol = rol
        self.esPrendaBase = esPrendaBase
        self.productoId = productoId
        self.titulo = titulo
        self.tiendaNombre = tiendaNombre
        self.url = url
        self.imagenUrl = imagenUrl
        self.precioCentimos = precioCentimos
    }
}
