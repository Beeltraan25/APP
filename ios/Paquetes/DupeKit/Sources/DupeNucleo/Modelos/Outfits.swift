import Foundation

public enum RolPieza: String, Codable, Hashable, Sendable, CaseIterable {
    case superior, inferior, vestido, abrigo, calzado, bolso, accesorio

    public var titulo: String {
        switch self {
        case .superior: "Parte de arriba"
        case .inferior: "Parte de abajo"
        case .vestido: "Vestido"
        case .abrigo: "Abrigo"
        case .calzado: "Calzado"
        case .bolso: "Bolso"
        case .accesorio: "Complemento"
        }
    }
}

public struct ColorNombrado: Codable, Hashable, Sendable {
    public var nombre: String
    public var hex: String
}

public struct PrendaTipica: Codable, Hashable, Sendable {
    public var rol: RolPieza
    public var descripcion: String
}

/// Lo que define un estilo, deducido de imágenes de referencia.
public struct PerfilEstilo: Codable, Hashable, Sendable {
    public var estilo: String
    public var resumen: String
    public var prendasTipicas: [PrendaTipica]
    public var paleta: [ColorNombrado]
    public var siluetas: [String]
    public var calzado: [String]
}

public struct PiezaOutfit: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var rol: RolPieza
    public var esPrendaBase: Bool
    public var descripcion: String
    /// Búsqueda en Google Shopping; sirve para "Cambiar esta prenda". Nil en la prenda base.
    public var consulta: String?
    /// La prenda base puede no tener producto (foto propia).
    public var producto: ProductoOrigen?
    public var imagenUrl: URL?
}

public struct Outfit: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var titulo: String
    public var porQueEncaja: String
    public var piezas: [PiezaOutfit]
    public var precioTotal: Precio

    /// Cambia una pieza por otro producto y recalcula el total.
    public mutating func reemplazar(pieza id: PiezaOutfit.ID, por producto: Producto) {
        guard let indice = piezas.firstIndex(where: { $0.id == id }) else { return }
        piezas[indice].producto = ProductoOrigen(producto)
        piezas[indice].imagenUrl = producto.imagenUrl
        precioTotal = Precio(centimos: piezas.compactMap { $0.producto?.precio?.centimos }.reduce(0, +))
    }
}

public struct RespuestaOutfits: Codable, Hashable, Sendable {
    public var perfilEstilo: PerfilEstilo
    public var outfits: [Outfit]
    public var desdeCache: Bool
}

/// Presupuesto máximo por cada pieza nueva (mismos tramos que los resultados).
public enum PresupuestoPorPrenda: String, CaseIterable, Hashable, Sendable, Identifiable {
    case hasta25, hasta60, hasta150, sinLimite

    public var id: String { rawValue }

    public var centimos: Int? {
        switch self {
        case .hasta25: 2500
        case .hasta60: 6000
        case .hasta150: 15000
        case .sinLimite: nil
        }
    }

    public var titulo: String {
        switch self {
        case .hasta25: "Hasta 25 €"
        case .hasta60: "Hasta 60 €"
        case .hasta150: "Hasta 150 €"
        case .sinLimite: "Sin límite"
        }
    }

    /// Para el selector segmentado (el título de la sección ya dice "máximo por prenda").
    public var tituloCorto: String {
        switch self {
        case .hasta25: "25 €"
        case .hasta60: "60 €"
        case .hasta150: "150 €"
        case .sinLimite: "Sin límite"
        }
    }
}

/// La prenda alrededor de la que se crean los outfits: la original o una alternativa elegida.
public struct PrendaBase: Hashable, Sendable {
    public var ficha: FichaPrenda
    public var producto: ProductoOrigen?
    /// Imagen pública (la de /v1/analizar o la de la tienda): la usa el backend.
    public var imagenUrl: URL?
    /// La foto que hizo el usuario, para enseñarla en la app.
    public var fotoLocal: Data?

    public init(ficha: FichaPrenda, producto: ProductoOrigen? = nil, imagenUrl: URL? = nil, fotoLocal: Data? = nil) {
        self.ficha = ficha
        self.producto = producto
        self.imagenUrl = imagenUrl
        self.fotoLocal = fotoLocal
    }

    public var nombre: String {
        producto?.titulo ?? (ficha.subcategoria ?? ficha.categoria)
    }
}

extension ProductoOrigen {
    /// Una alternativa (siempre con precio) como producto de una pieza.
    public init(_ producto: Producto) {
        self.init(
            id: producto.id,
            titulo: producto.titulo,
            tienda: producto.tienda,
            marca: producto.marca,
            url: producto.url,
            imagenUrl: producto.imagenUrl,
            precio: producto.precio,
            precioAnterior: producto.precioAnterior,
            rango: producto.rango
        )
    }
}

/// Estilos que se ofrecen como chips (también se puede escribir otro).
public enum EstilosSugeridos {
    public static let todos = ["old money", "minimalista", "streetwear", "smart casual", "gorpcore", "vintage", "y2k"]
}
