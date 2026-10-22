import Foundation

/// Ficha técnica de una prenda, tal como la devuelve el backend (POST /v1/analizar).
/// El JSON viene en snake_case y se decodifica con `.convertFromSnakeCase`.
public struct FichaPrenda: Codable, Hashable, Sendable {
    public var categoria: String
    public var subcategoria: String?
    public var colorPrincipal: ColorPrenda
    public var coloresSecundarios: [ColorPrenda]
    public var estampado: String
    public var material: String?
    public var composicion: [Fibra]
    public var gramajeGsm: Int?
    public var gramajeEstimado: GramajeEstimado?
    public var fit: Fit?
    public var largo: String?
    public var cuello: String?
    public var mangas: String?
    public var cierres: String?
    public var detalles: [String]
    public var acabado: String?
    public var palabrasClaveBusqueda: [String]
    /// Nombres (en el formato de la API, p. ej. "gramaje_gsm") de los datos deducidos por la IA.
    public var camposEstimados: [String]
    public var publico: Publico
}

public struct ColorPrenda: Codable, Hashable, Sendable {
    public var nombre: String
    /// "#RRGGBB"
    public var hex: String
}

public struct Fibra: Codable, Hashable, Sendable {
    public var fibra: String
    public var porcentaje: Int
}

/// ligero < 180 g/m² · medio 180–300 · pesado > 300
public enum GramajeEstimado: String, Codable, Hashable, Sendable, CaseIterable {
    case ligero, medio, pesado

    public var titulo: String {
        switch self {
        case .ligero: "Ligero"
        case .medio: "Medio"
        case .pesado: "Pesado"
        }
    }
}

public enum Fit: String, Codable, Hashable, Sendable, CaseIterable {
    case ajustado, regular, relajado, oversize, otro

    /// Un valor nuevo del backend se lee como `.otro` en vez de romper la app.
    public init(from decoder: any Decoder) throws {
        let valor = try decoder.singleValueContainer().decode(String.self)
        self = Fit(rawValue: valor) ?? .otro
    }

    public var titulo: String {
        switch self {
        case .ajustado: "Ajustado"
        case .regular: "Regular"
        case .relajado: "Relajado"
        case .oversize: "Oversize"
        case .otro: "Otro"
        }
    }
}

public enum Publico: String, Codable, Hashable, Sendable {
    case hombre, mujer, unisex
}

extension FichaPrenda {
    /// "100 % algodón, 5 % elastano"
    public var composicionTexto: String? {
        guard !composicion.isEmpty else { return nil }
        return composicion.map { "\($0.porcentaje) % \($0.fibra)" }.joined(separator: ", ")
    }

    /// "Pesado · 350 g/m²"
    public var gramajeTexto: String? {
        let partes = [gramajeEstimado?.titulo, gramajeGsm.map { "\($0) g/m²" }].compactMap { $0 }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}
