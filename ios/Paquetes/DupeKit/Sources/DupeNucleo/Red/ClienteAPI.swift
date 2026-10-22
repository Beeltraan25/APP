import Foundation

/// Dónde está el backend y con qué clave se habla con él.
public struct ConfiguracionAPI: Hashable, Sendable {
    public var urlBase: URL
    public var claveApp: String

    public init(urlBase: URL, claveApp: String) {
        self.urlBase = urlBase
        self.claveApp = claveApp
    }

    /// Lee URL_BACKEND y CLAVE_APP del Info.plist (vienen de Secretos.xcconfig).
    /// Devuelve nil si faltan: la app funciona entonces con datos de prueba.
    public static func desde(infoPlist: [String: Any]) -> ConfiguracionAPI? {
        guard let texto = (infoPlist["URL_BACKEND"] as? String)?.trimmingCharacters(in: .whitespaces),
              let url = URL(string: texto),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.host() != nil,
              let clave = (infoPlist["CLAVE_APP"] as? String)?.trimmingCharacters(in: .whitespaces),
              !clave.isEmpty
        else { return nil }
        return ConfiguracionAPI(urlBase: url, claveApp: clave)
    }
}

/// Habla con el backend. Traduce cualquier fallo a un `ErrorApp` con mensaje en español.
public final class ClienteAPI: Sendable {
    private let configuracion: ConfiguracionAPI
    private let sesion: URLSession
    private let instalacionId: String

    public init(configuracion: ConfiguracionAPI, sesion: URLSession = .shared, instalacionId: String) {
        self.configuracion = configuracion
        self.sesion = sesion
        self.instalacionId = instalacionId
    }

    /// POST /v1/analizar con una foto (JPEG ya reducido).
    public func analizar(foto: Data) async throws -> RespuestaAnalisis {
        let limite = "Limite-\(UUID().uuidString)"
        var cuerpo = Data()
        cuerpo.anadir("--\(limite)\r\n")
        cuerpo.anadir("Content-Disposition: form-data; name=\"imagen\"; filename=\"foto.jpg\"\r\n")
        cuerpo.anadir("Content-Type: image/jpeg\r\n\r\n")
        cuerpo.append(foto)
        cuerpo.anadir("\r\n--\(limite)--\r\n")

        var peticion = peticion(ruta: "v1/analizar")
        peticion.setValue("multipart/form-data; boundary=\(limite)", forHTTPHeaderField: "Content-Type")
        peticion.httpBody = cuerpo
        return try await enviar(peticion)
    }

    /// POST /v1/analizar con los datos de la página de un producto.
    public func analizar(pagina: DatosPagina) async throws -> RespuestaAnalisis {
        struct Cuerpo: Encodable { let pagina: DatosPagina }
        var peticion = peticion(ruta: "v1/analizar")
        peticion.setValue("application/json", forHTTPHeaderField: "Content-Type")
        peticion.httpBody = try JSONEncoder().encode(Cuerpo(pagina: pagina))
        return try await enviar(peticion)
    }

    /// POST /v1/buscar con la ficha revisada por el usuario.
    public func buscar(imagenUrl: URL?, ficha: FichaPrenda) async throws -> RespuestaBusqueda {
        var peticion = peticion(ruta: "v1/buscar")
        peticion.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let codificador = JSONEncoder()
        // La ficha no tiene claves dinámicas: aquí sí se puede convertir a snake_case.
        codificador.keyEncodingStrategy = .convertToSnakeCase
        peticion.httpBody = try codificador.encode(CuerpoBusqueda(imagenUrl: imagenUrl, ficha: ficha))
        return try await enviar(peticion)
    }

    /// POST /v1/outfits. La respuesta llega por líneas: progreso ("Analizando el estilo…") y, al final, el resultado.
    public func outfits(
        base: PrendaBase,
        estilo: String,
        presupuesto: PresupuestoPorPrenda,
        progreso: @escaping @Sendable (String) async -> Void
    ) async throws -> RespuestaOutfits {
        var peticion = peticion(ruta: "v1/outfits")
        // Puede tardar hasta un minuto; entre línea y línea de progreso nunca pasan 3 minutos.
        peticion.timeoutInterval = 180
        peticion.setValue("application/json", forHTTPHeaderField: "Content-Type")
        peticion.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
        let codificador = JSONEncoder()
        codificador.keyEncodingStrategy = .convertToSnakeCase
        peticion.httpBody = try codificador.encode(
            CuerpoOutfits(
                prendaBase: .init(ficha: base.ficha, producto: base.producto, imagenUrl: base.imagenUrl),
                estilo: estilo,
                presupuesto: .init(maximoPorPrendaCentimos: presupuesto.centimos)
            )
        )

        let bytes: URLSession.AsyncBytes
        let respuesta: URLResponse
        do {
            (bytes, respuesta) = try await sesion.bytes(for: peticion)
        } catch let error as URLError {
            throw Self.traducir(error)
        }
        guard let http = respuesta as? HTTPURLResponse else { throw ErrorApp.respuestaNoValida }
        let decodificador = DatosSimulados.decodificador()

        // Errores antes de empezar (clave, petición no válida…): JSON normal.
        guard (200..<300).contains(http.statusCode) else {
            var datos = Data()
            for try await byte in bytes { datos.append(byte) }
            if let cuerpo = try? decodificador.decode(CuerpoError.self, from: datos) { throw ErrorApp.servidor(cuerpo.error) }
            throw ErrorApp.respuestaNoValida
        }

        do {
            for try await linea in bytes.lines {
                guard let datos = linea.data(using: .utf8),
                      let evento = try? decodificador.decode(EventoOutfits.self, from: datos)
                else { continue }
                switch evento.tipo {
                case "progreso":
                    if let mensaje = evento.mensaje { await progreso(mensaje) }
                case "resultado":
                    guard let resultado = evento.datos else { throw ErrorApp.respuestaNoValida }
                    return resultado
                case "error":
                    throw evento.error.map(ErrorApp.servidor) ?? ErrorApp.desconocido
                default:
                    continue
                }
            }
        } catch let error as URLError {
            throw Self.traducir(error)
        }
        // El stream terminó sin resultado.
        throw ErrorApp.respuestaNoValida
    }

    /// POST /v1/outfits/cambiar-pieza: otras opciones para una pieza (no gasta búsquedas si ya se buscó).
    public func cambiarPieza(consulta: String, presupuesto: PresupuestoPorPrenda, excluir: [String]) async throws -> [Producto] {
        var peticion = peticion(ruta: "v1/outfits/cambiar-pieza")
        peticion.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let codificador = JSONEncoder()
        codificador.keyEncodingStrategy = .convertToSnakeCase
        peticion.httpBody = try codificador.encode(
            CuerpoCambiarPieza(
                consulta: consulta,
                presupuesto: .init(maximoPorPrendaCentimos: presupuesto.centimos),
                excluir: excluir
            )
        )
        let respuesta: RespuestaCambiarPieza = try await enviar(peticion)
        return respuesta.opciones
    }

    // MARK: - Base

    private func peticion(ruta: String) -> URLRequest {
        // El análisis con IA puede tardar: 90 s antes de rendirse.
        var peticion = URLRequest(url: configuracion.urlBase.appending(path: ruta), timeoutInterval: 90)
        peticion.httpMethod = "POST"
        peticion.setValue(configuracion.claveApp, forHTTPHeaderField: "X-Clave-App")
        peticion.setValue(instalacionId, forHTTPHeaderField: "X-Instalacion-Id")
        peticion.setValue("application/json", forHTTPHeaderField: "Accept")
        return peticion
    }

    private func enviar<T: Decodable>(_ peticion: URLRequest) async throws -> T {
        let datos: Data
        let respuesta: URLResponse
        do {
            (datos, respuesta) = try await sesion.data(for: peticion)
        } catch let error as URLError {
            throw Self.traducir(error)
        } catch {
            throw ErrorApp.desconocido
        }

        guard let http = respuesta as? HTTPURLResponse else { throw ErrorApp.respuestaNoValida }
        let decodificador = DatosSimulados.decodificador()

        guard (200..<300).contains(http.statusCode) else {
            if let cuerpo = try? decodificador.decode(CuerpoError.self, from: datos) {
                throw ErrorApp.servidor(cuerpo.error)
            }
            throw ErrorApp.respuestaNoValida
        }

        do {
            return try decodificador.decode(T.self, from: datos)
        } catch {
            throw ErrorApp.respuestaNoValida
        }
    }

    static func traducir(_ error: URLError) -> ErrorApp {
        switch error.code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost,
             .cannotFindHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff:
            .sinConexion
        default:
            .desconocido
        }
    }
}

private struct CuerpoBusqueda: Encodable {
    let imagenUrl: URL?
    let ficha: FichaPrenda
}

/// Presupuesto con "null" explícito cuando no hay límite (JSONEncoder omitiría la clave).
private struct PresupuestoCuerpo: Encodable {
    let maximoPorPrendaCentimos: Int?

    enum CodingKeys: String, CodingKey { case maximoPorPrendaCentimos }

    func encode(to encoder: any Encoder) throws {
        var contenedor = encoder.container(keyedBy: CodingKeys.self)
        try contenedor.encode(maximoPorPrendaCentimos, forKey: .maximoPorPrendaCentimos)
    }
}

private struct CuerpoOutfits: Encodable {
    struct Base: Encodable {
        let ficha: FichaPrenda
        let producto: ProductoOrigen?
        let imagenUrl: URL?
    }

    let prendaBase: Base
    let estilo: String
    let presupuesto: PresupuestoCuerpo
}

private struct CuerpoCambiarPieza: Encodable {
    let consulta: String
    let presupuesto: PresupuestoCuerpo
    let excluir: [String]
}

private struct RespuestaCambiarPieza: Decodable {
    let opciones: [Producto]
}

/// Una línea de la respuesta de /v1/outfits.
private struct EventoOutfits: Decodable {
    let tipo: String
    let mensaje: String?
    let datos: RespuestaOutfits?
    let error: ErrorAPI?
}

/// Cuerpo de error del backend: { "error": { "codigo", "mensaje" } }
private struct CuerpoError: Decodable {
    let error: ErrorAPI
}

extension Data {
    fileprivate mutating func anadir(_ texto: String) {
        append(Data(texto.utf8))
    }
}
