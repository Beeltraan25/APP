import Foundation
import Testing
@testable import DupeNucleo

/// Red simulada: intercepta las peticiones de URLSession y responde lo que diga cada test.
final class ProtocoloSimulado: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var responder: ((URLRequest, Data?) throws -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard let responder = Self.responder, let url = request.url else { return }
        do {
            let (estado, datos) = try responder(request, Self.cuerpo(de: request))
            let respuesta = HTTPURLResponse(url: url, statusCode: estado, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: respuesta, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: datos)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    /// URLSession convierte httpBody en un stream: hay que leerlo.
    static func cuerpo(de peticion: URLRequest) -> Data? {
        if let cuerpo = peticion.httpBody { return cuerpo }
        guard let stream = peticion.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var datos = Data()
        var bufer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let leidos = stream.read(&bufer, maxLength: bufer.count)
            if leidos <= 0 { break }
            datos.append(bufer, count: leidos)
        }
        return datos
    }
}

/// Guarda lo que llegó a la red simulada.
final class Registro: @unchecked Sendable {
    var peticion: URLRequest?
    var cuerpo: Data?
}

@Suite("Cliente de la API", .serialized)
struct ClienteAPITests {
    private func cliente() -> ClienteAPI {
        let configuracionSesion = URLSessionConfiguration.ephemeral
        configuracionSesion.protocolClasses = [ProtocoloSimulado.self]
        return ClienteAPI(
            configuracion: ConfiguracionAPI(urlBase: URL(string: "https://api.prueba")!, claveApp: "secreta"),
            sesion: URLSession(configuration: configuracionSesion),
            instalacionId: "instalacion-1"
        )
    }

    /// La respuesta real de una foto, en el formato del backend (snake_case).
    private func respuestaFoto() throws -> Data {
        let codificador = JSONEncoder()
        codificador.keyEncodingStrategy = .convertToSnakeCase
        return try codificador.encode(DatosSimulados.analisisFoto)
    }

    @Test("Envía la foto en multipart con la clave y el id de instalación")
    func foto() async throws {
        let registro = Registro()
        let respuesta = try respuestaFoto()
        ProtocoloSimulado.responder = { peticion, cuerpo in
            registro.peticion = peticion
            registro.cuerpo = cuerpo
            return (200, respuesta)
        }

        let resultado = try await cliente().analizar(foto: Data([0xFF, 0xD8, 0xFF]))

        #expect(resultado.ficha.categoria == "vaqueros")
        let peticion = try #require(registro.peticion)
        #expect(peticion.httpMethod == "POST")
        #expect(peticion.url?.path() == "/v1/analizar")
        #expect(peticion.value(forHTTPHeaderField: "X-Clave-App") == "secreta")
        #expect(peticion.value(forHTTPHeaderField: "X-Instalacion-Id") == "instalacion-1")
        #expect(peticion.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        let cuerpo = String(decoding: try #require(registro.cuerpo), as: UTF8.self)
        #expect(cuerpo.contains(#"name="imagen"; filename="foto.jpg""#))
    }

    @Test("Envía los datos de la página como JSON")
    func pagina() async throws {
        let registro = Registro()
        let respuesta = try respuestaFoto()
        ProtocoloSimulado.responder = { _, cuerpo in
            registro.cuerpo = cuerpo
            return (200, respuesta)
        }

        let pagina = DatosPagina(
            url: URL(string: "https://www.zara.com/es/es/x.html")!,
            titulo: "SUDADERA",
            imagenUrl: URL(string: "https://static.zara.net/foto.jpg"),
            jsonLd: .objeto(["@type": .texto("Product"), "priceCurrency": .texto("EUR")])
        )
        _ = try await cliente().analizar(pagina: pagina)

        let json = try JSONSerialization.jsonObject(with: try #require(registro.cuerpo)) as? [String: Any]
        let enviada = try #require(json?["pagina"] as? [String: Any])
        #expect(enviada["titulo"] as? String == "SUDADERA")
        #expect(enviada["imagen_url"] as? String == "https://static.zara.net/foto.jpg")
        #expect((enviada["json_ld"] as? [String: Any])?["priceCurrency"] as? String == "EUR")
    }

    @Test("Envía la ficha para buscar en snake_case, como espera el backend")
    func buscar() async throws {
        let registro = Registro()
        let codificador = JSONEncoder()
        codificador.keyEncodingStrategy = .convertToSnakeCase
        let respuesta = try codificador.encode(DatosSimulados.busqueda)
        ProtocoloSimulado.responder = { peticion, cuerpo in
            registro.peticion = peticion
            registro.cuerpo = cuerpo
            return (200, respuesta)
        }

        let ficha = DatosSimulados.analisisFoto.ficha
        let resultado = try await cliente().buscar(imagenUrl: URL(string: "https://api.prueba/v1/imagenes/an_1"), ficha: ficha)

        #expect(resultado.alternativas.count == 11)
        #expect(registro.peticion?.url?.path() == "/v1/buscar")
        let json = try JSONSerialization.jsonObject(with: try #require(registro.cuerpo)) as? [String: Any]
        #expect(json?["imagen_url"] as? String == "https://api.prueba/v1/imagenes/an_1")
        let fichaEnviada = try #require(json?["ficha"] as? [String: Any])
        #expect(fichaEnviada["palabras_clave_busqueda"] as? [String] == ficha.palabrasClaveBusqueda)
        #expect(fichaEnviada["gramaje_gsm"] as? Int == 350)
        #expect((fichaEnviada["color_principal"] as? [String: Any])?["hex"] as? String == "#1B2A4A")
    }

    @Test("Los errores del backend llegan con su mensaje en español")
    func errorDelBackend() async {
        ProtocoloSimulado.responder = { _, _ in
            (422, Data(#"{"error":{"codigo":"SOLO_HOMBRE","mensaje":"Por ahora Dupe Finder solo busca ropa de hombre."}}"#.utf8))
        }
        let esperado = ErrorApp.servidor(ErrorAPI(codigo: "SOLO_HOMBRE", mensaje: "Por ahora Dupe Finder solo busca ropa de hombre."))
        await #expect(throws: esperado) {
            try await cliente().analizar(foto: Data())
        }
    }

    @Test("Sin conexión da un mensaje claro")
    func sinConexion() async {
        ProtocoloSimulado.responder = { _, _ in throw URLError(.notConnectedToInternet) }
        await #expect(throws: ErrorApp.sinConexion) {
            try await cliente().analizar(foto: Data())
        }
    }

    @Test("Una respuesta que no es JSON se trata como respuesta no válida")
    func respuestaRara() async {
        ProtocoloSimulado.responder = { _, _ in (502, Data("<html>Bad gateway</html>".utf8)) }
        await #expect(throws: ErrorApp.respuestaNoValida) {
            try await cliente().analizar(foto: Data())
        }
    }
}
