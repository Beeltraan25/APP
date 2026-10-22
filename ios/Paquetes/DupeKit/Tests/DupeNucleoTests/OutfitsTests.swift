import Foundation
import Testing
@testable import DupeNucleo

@Suite("Outfits")
struct OutfitsTests {
    @Test("Lee los outfits reales: 3, con la prenda base y precio total")
    func lectura() throws {
        let respuesta = DatosSimulados.outfits
        #expect(respuesta.perfilEstilo.estilo == "old money")
        #expect(respuesta.outfits.count == 3)
        for outfit in respuesta.outfits {
            #expect(outfit.piezas.filter(\.esPrendaBase).count == 1)
            let suma = outfit.piezas.compactMap { $0.producto?.precio?.centimos }.reduce(0, +)
            #expect(outfit.precioTotal.centimos == suma)
            #expect(outfit.piezas.filter { !$0.esPrendaBase }.allSatisfy { $0.consulta != nil && $0.producto != nil })
        }
    }

    @Test("Reemplazar una pieza recalcula el total")
    func reemplazar() throws {
        var outfit = try #require(DatosSimulados.outfits.outfits.first)
        let pieza = try #require(outfit.piezas.first { !$0.esPrendaBase })
        let nuevo = DatosSimulados.busqueda.alternativas[0].producto
        outfit.reemplazar(pieza: pieza.id, por: nuevo)
        #expect(outfit.piezas.first { $0.id == pieza.id }?.imagenUrl == nuevo.imagenUrl)
        #expect(outfit.precioTotal.centimos == outfit.piezas.compactMap { $0.producto?.precio?.centimos }.reduce(0, +))
    }

    @Test("Las opciones simuladas respetan el presupuesto y no repiten")
    func cambiarPiezaSimulado() async throws {
        let servicio = ServicioOutfitsSimulado(retraso: .zero)
        let excluir = [DatosSimulados.busqueda.alternativas[1].producto.id]
        let opciones = try await servicio.cambiarPieza(consulta: "x", presupuesto: .hasta60, excluir: excluir)
        #expect(!opciones.isEmpty)
        #expect(opciones.allSatisfy { $0.precio.centimos <= 6000 && !excluir.contains($0.id) })
    }

    @Test("Presupuestos por prenda")
    func presupuestos() {
        #expect(PresupuestoPorPrenda.hasta60.centimos == 6000)
        #expect(PresupuestoPorPrenda.sinLimite.centimos == nil)
    }
}

@Suite("Cliente: outfits por líneas", .serialized)
struct ClienteOutfitsTests {
    private func cliente() -> ClienteAPI {
        let configuracion = URLSessionConfiguration.ephemeral
        configuracion.protocolClasses = [ProtocoloSimulado.self]
        return ClienteAPI(
            configuracion: ConfiguracionAPI(urlBase: URL(string: "https://api.prueba")!, claveApp: "secreta"),
            sesion: URLSession(configuration: configuracion),
            instalacionId: "instalacion-1"
        )
    }

    private func lineas(_ eventos: [String]) -> Data {
        Data(eventos.joined(separator: "\n").appending("\n").utf8)
    }

    @Test("Lee el progreso y el resultado; envía el presupuesto con null si no hay límite")
    func resultado() async throws {
        let codificador = JSONEncoder()
        codificador.keyEncodingStrategy = .convertToSnakeCase
        let datos = String(decoding: try codificador.encode(DatosSimulados.outfits), as: UTF8.self)
        let registro = Registro()
        ProtocoloSimulado.responder = { _, cuerpo in
            registro.cuerpo = cuerpo
            return (200, self.lineas([
                #"{"tipo":"progreso","paso":"referencias","mensaje":"Buscando referencias de old money…"}"#,
                #"{"tipo":"progreso","paso":"estilo","mensaje":"Analizando el estilo…"}"#,
                #"{"tipo":"resultado","datos":\#(datos)}"#,
            ]))
        }
        let mensajes = Mensajes()
        let respuesta = try await cliente().outfits(
            base: DatosSimulados.prendaBase,
            estilo: "old money",
            presupuesto: .sinLimite
        ) { mensaje in await mensajes.anadir(mensaje) }

        #expect(respuesta.outfits.count == 3)
        #expect(await mensajes.lista == ["Buscando referencias de old money…", "Analizando el estilo…"])
        let json = try JSONSerialization.jsonObject(with: try #require(registro.cuerpo)) as? [String: Any]
        let presupuesto = try #require(json?["presupuesto"] as? [String: Any])
        #expect(presupuesto.keys.contains("maximo_por_prenda_centimos"))
        #expect(presupuesto["maximo_por_prenda_centimos"] is NSNull)
        #expect((json?["prenda_base"] as? [String: Any])?["ficha"] != nil)
    }

    @Test("Un error a mitad del stream llega como ErrorApp con su mensaje")
    func errorEnStream() async {
        ProtocoloSimulado.responder = { _, _ in
            (200, self.lineas([
                #"{"tipo":"progreso","paso":"piezas","mensaje":"Buscando las piezas…"}"#,
                #"{"tipo":"error","error":{"codigo":"CUOTA_BUSQUEDAS","mensaje":"Sin búsquedas"}}"#,
            ]))
        }
        await #expect(throws: ErrorApp.servidor(ErrorAPI(codigo: "CUOTA_BUSQUEDAS", mensaje: "Sin búsquedas"))) {
            try await cliente().outfits(base: DatosSimulados.prendaBase, estilo: "old money", presupuesto: .hasta60) { _ in }
        }
    }

    @Test("Un error antes de empezar llega como JSON normal")
    func errorAntes() async {
        ProtocoloSimulado.responder = { _, _ in
            (400, Data(#"{"error":{"codigo":"PETICION_NO_VALIDA","mensaje":"Formato incorrecto"}}"#.utf8))
        }
        await #expect(throws: ErrorApp.servidor(ErrorAPI(codigo: "PETICION_NO_VALIDA", mensaje: "Formato incorrecto"))) {
            try await cliente().outfits(base: DatosSimulados.prendaBase, estilo: "x", presupuesto: .hasta60) { _ in }
        }
    }
}

/// Guarda los mensajes de progreso.
actor Mensajes {
    private(set) var lista: [String] = []
    func anadir(_ mensaje: String) { lista.append(mensaje) }
}
