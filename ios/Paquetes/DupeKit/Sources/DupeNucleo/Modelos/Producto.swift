import Foundation

/// Precio en céntimos enteros, para evitar errores de redondeo.
public struct Precio: Codable, Hashable, Sendable, Comparable {
    public var centimos: Int
    public var moneda: String

    public init(centimos: Int, moneda: String = "EUR") {
        self.centimos = centimos
        self.moneda = moneda
    }

    public var importe: Decimal { Decimal(centimos) / 100 }

    /// "12,99 €" (formato español).
    public var formateado: String {
        importe.formatted(.currency(code: moneda).locale(Locale(identifier: "es_ES")))
    }

    public static func < (a: Precio, b: Precio) -> Bool { a.centimos < b.centimos }
}

/// Económico < 25 € · Medio 25–60 € · Alto más de 60 hasta 150 € · Premium más de 150 €
public enum RangoPrecio: String, Codable, Hashable, Sendable, CaseIterable, Identifiable {
    case economico, medio, alto, premium

    public var id: String { rawValue }

    public var titulo: String {
        switch self {
        case .economico: "Económico"
        case .medio: "Medio"
        case .alto: "Alto"
        case .premium: "Premium"
        }
    }

    public var descripcion: String {
        switch self {
        case .economico: "Menos de 25 €"
        case .medio: "25–60 €"
        case .alto: "60–150 €"
        case .premium: "Más de 150 €"
        }
    }

    /// Mismos cortes que el backend.
    public static func para(centimos: Int) -> RangoPrecio {
        if centimos < 2500 { return .economico }
        if centimos <= 6000 { return .medio }
        if centimos <= 15000 { return .alto }
        return .premium
    }
}

public struct Tienda: Codable, Hashable, Sendable {
    public var id: String
    public var nombre: String
}

/// La prenda original de un enlace. Puede que la página no muestre el precio.
public struct ProductoOrigen: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var titulo: String
    public var tienda: Tienda
    public var marca: String?
    public var url: URL
    public var imagenUrl: URL?
    public var precio: Precio?
    public var precioAnterior: Precio?
    public var rango: RangoPrecio?
}
