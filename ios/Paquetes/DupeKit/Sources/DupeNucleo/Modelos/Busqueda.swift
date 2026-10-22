import Foundation

/// Un producto de una tienda de la lista blanca (siempre con precio en euros).
public struct Producto: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var titulo: String
    public var tienda: Tienda
    /// Puede ser distinta de la tienda (Zalando, ASOS, El Corte Inglés venden otras marcas).
    public var marca: String?
    /// Página del producto en la tienda (o en Google Shopping, que enlaza a la tienda).
    public var url: URL
    public var imagenUrl: URL?
    public var precio: Precio
    public var precioAnterior: Precio?
    public var rango: RangoPrecio
}

/// Una alternativa a la prenda buscada.
public struct Alternativa: Codable, Hashable, Sendable, Identifiable {
    public var producto: Producto
    /// Se calcula en la fase 4; hasta entonces es nil.
    public var similitud: Similitud?
    public var etiquetas: [Etiqueta]
    /// "lens" (búsqueda por imagen) o "shopping" (búsqueda por texto).
    public var fuente: String

    public var id: String { producto.id }

    /// Google Shopping no da la página de la tienda: "Ver en tienda" abre Google Shopping.
    public var abreGoogleShopping: Bool { fuente == "shopping" }
}

public struct Similitud: Codable, Hashable, Sendable {
    /// 0–100
    public var total: Int
    public var criterios: [CriterioSimilitud]
}

public struct CriterioSimilitud: Codable, Hashable, Sendable {
    /// visual, color, gramaje, material, fit o detalles
    public var criterio: String
    public var pesoBase: Double
    public var pesoAplicado: Double
    public var puntuacion: Int?
    public var disponible: Bool

    /// Nombre para el usuario.
    public var titulo: String {
        switch criterio {
        case "visual": "Aspecto"
        case "color": "Color"
        case "gramaje": "Gramaje"
        case "material": "Material"
        case "fit": "Corte"
        case "detalles": "Detalles"
        default: criterio.capitalized
        }
    }
}

public struct Etiqueta: Codable, Hashable, Sendable {
    public enum Tipo: String, Codable, Hashable, Sendable {
        case coincide, diferencia
    }

    public var texto: String
    public var tipo: Tipo
}

/// Respuesta de POST /v1/buscar: todos los rangos de precio a la vez.
public struct RespuestaBusqueda: Codable, Hashable, Sendable {
    public var busquedaId: String
    public var alternativas: [Alternativa]
    public var conteoPorRango: [String: Int]
    public var desdeCache: Bool
}

extension RangoPrecio {
    /// Texto corto para el selector: "<25 €", "25–60 €"…
    public var etiquetaCorta: String {
        switch self {
        case .economico: "<25 €"
        case .medio: "25–60 €"
        case .alto: "60–150 €"
        case .premium: "+150 €"
        }
    }
}
