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
            struct CuerpoError: Decodable { let error: ErrorAPI }
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

extension Data {
    fileprivate mutating func anadir(_ texto: String) {
        append(Data(texto.utf8))
    }
}
