import Foundation

/// Datos de la página de un producto, leídos en el iPhone y enviados a POST /v1/analizar.
/// Se leen en el móvil porque las tiendas bloquean las descargas desde servidores.
public struct DatosPagina: Codable, Hashable, Sendable {
    public var url: URL
    public var titulo: String?
    public var imagenUrl: URL?
    public var precioTexto: String?
    public var descripcion: String?
    /// Nodo Product de schema.org tal cual (sin cambiar sus claves).
    public var jsonLd: ValorJSON?

    // Claves explícitas: no se puede usar `.convertToSnakeCase` porque también cambiaría
    // las claves del JSON-LD (priceCurrency → price_currency) y el backend no las entendería.
    enum CodingKeys: String, CodingKey {
        case url, titulo, descripcion
        case imagenUrl = "imagen_url"
        case precioTexto = "precio_texto"
        case jsonLd = "json_ld"
    }

    public init(
        url: URL,
        titulo: String? = nil,
        imagenUrl: URL? = nil,
        precioTexto: String? = nil,
        descripcion: String? = nil,
        jsonLd: ValorJSON? = nil
    ) {
        self.url = url
        self.titulo = titulo
        self.imagenUrl = imagenUrl
        self.precioTexto = precioTexto
        self.descripcion = descripcion
        self.jsonLd = jsonLd
    }

    /// Una página de producto de verdad tiene datos estructurados o imagen. Las páginas de
    /// verificación anti-bots ("Security Checkpoint") pueden tener título, pero no esto.
    public var esUtil: Bool {
        jsonLd != nil || imagenUrl != nil
    }
}

/// Cualquier valor JSON, para enviar el JSON-LD de la tienda sin conocer su forma.
public enum ValorJSON: Codable, Hashable, Sendable {
    case nulo
    case booleano(Bool)
    case numero(Double)
    case texto(String)
    case lista([ValorJSON])
    case objeto([String: ValorJSON])

    public init(from decoder: any Decoder) throws {
        let contenedor = try decoder.singleValueContainer()
        if contenedor.decodeNil() {
            self = .nulo
        } else if let valor = try? contenedor.decode(Bool.self) {
            self = .booleano(valor)
        } else if let valor = try? contenedor.decode(Double.self) {
            self = .numero(valor)
        } else if let valor = try? contenedor.decode(String.self) {
            self = .texto(valor)
        } else if let valor = try? contenedor.decode([ValorJSON].self) {
            self = .lista(valor)
        } else {
            self = .objeto(try contenedor.decode([String: ValorJSON].self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var contenedor = encoder.singleValueContainer()
        switch self {
        case .nulo: try contenedor.encodeNil()
        case .booleano(let valor): try contenedor.encode(valor)
        case .numero(let valor): try contenedor.encode(valor)
        case .texto(let valor): try contenedor.encode(valor)
        case .lista(let valor): try contenedor.encode(valor)
        case .objeto(let valor): try contenedor.encode(valor)
        }
    }

    /// Convierte lo que devuelve `JSONSerialization`.
    public init?(json: Any) {
        switch json {
        case is NSNull:
            self = .nulo
        case let numero as NSNumber:
            self = CFGetTypeID(numero) == CFBooleanGetTypeID() ? .booleano(numero.boolValue) : .numero(numero.doubleValue)
        case let texto as String:
            self = .texto(texto)
        case let lista as [Any]:
            self = .lista(lista.compactMap(ValorJSON.init(json:)))
        case let objeto as [String: Any]:
            self = .objeto(objeto.compactMapValues(ValorJSON.init(json:)))
        default:
            return nil
        }
    }

    public subscript(clave: String) -> ValorJSON? {
        if case .objeto(let objeto) = self { return objeto[clave] }
        return nil
    }

    public var texto: String? {
        if case .texto(let texto) = self { return texto }
        return nil
    }
}
