import DupeNucleo
import Foundation
import SwiftData
import Testing
import UIKit
@testable import DupeFinder

@MainActor
@Suite("Historial de fotos")
struct HistorialTests {
    private func contexto() throws -> ModelContext {
        let esquema = Schema([PrendaGuardada.self, OutfitGuardado.self, PrendaBuscada.self])
        let contenedor = try ModelContainer(for: esquema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        return ModelContext(contenedor)
    }

    private func foto(_ color: UIColor) -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 40, height: 50)).image { _ in
            color.setFill()
            UIRectFill(CGRect(x: 0, y: 0, width: 40, height: 50))
        }.jpegData(compressionQuality: 0.8)!
    }

    private func todas(_ contexto: ModelContext) throws -> [PrendaBuscada] {
        try contexto.fetch(FetchDescriptor<PrendaBuscada>(sortBy: [SortDescriptor(\.fechaUso, order: .reverse)]))
    }

    @Test("Cada foto analizada se guarda, con miniatura, y la misma foto no se repite")
    func guardaSinRepetir() throws {
        let contexto = try contexto()
        let roja = foto(.red)
        Historial.registrar(AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: roja), en: contexto)
        Historial.registrar(AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: foto(.blue)), en: contexto)
        Historial.registrar(AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: roja), en: contexto)

        let prendas = try todas(contexto)
        #expect(prendas.count == 2)
        #expect(prendas.allSatisfy { $0.miniatura != nil && $0.foto != nil })
        // La que se ha vuelto a usar va primero.
        #expect(prendas.first?.foto == roja)
        #expect(prendas.first?.titulo.hasPrefix("Vaqueros") == true)
    }

    @Test("Los enlaces también se guardan, sin foto")
    func enlaces() throws {
        let contexto = try contexto()
        Historial.registrar(AnalisisPresentado(respuesta: DatosSimulados.analisisEnlace, foto: nil), en: contexto)
        let prenda = try #require(try todas(contexto).first)
        #expect(prenda.foto == nil)
        #expect(prenda.imagenUrl != nil)
        #expect(!prenda.caducada)
    }

    @Test("Reabrir devuelve la misma ficha y no crea otra entrada")
    func reabrir() throws {
        let contexto = try contexto()
        Historial.registrar(AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: foto(.red)), en: contexto)
        let prenda = try #require(try todas(contexto).first)
        let analisis = try #require(prenda.analisis())
        #expect(analisis.reabierto)
        #expect(analisis.respuesta == DatosSimulados.analisisFoto)

        Historial.registrar(analisis, en: contexto)
        #expect(try todas(contexto).count == 1)
    }

    @Test("Una foto de hace más de un día hay que volver a analizarla")
    func caducada() throws {
        let contexto = try contexto()
        Historial.registrar(AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: foto(.red)), en: contexto)
        let prenda = try #require(try todas(contexto).first)
        #expect(!prenda.caducada)
        prenda.fechaAnalisis = .now.addingTimeInterval(-25 * 3600)
        #expect(prenda.caducada)
    }

    @Test("Se queda solo con las más recientes")
    func recorta() throws {
        let contexto = try contexto()
        let datos = try JSONEncoder().encode(DatosSimulados.analisisFoto)
        for indice in 0..<(Historial.maximo + 5) {
            contexto.insert(
                PrendaBuscada(
                    huella: "h\(indice)", titulo: "", foto: nil, miniatura: nil, imagenUrl: nil, respuesta: datos,
                    fechaUso: .now.addingTimeInterval(Double(indice))
                )
            )
        }
        try contexto.save()
        Historial.recortar(contexto)
        let quedan = try todas(contexto)
        #expect(quedan.count == Historial.maximo)
        #expect(!quedan.contains { $0.huella == "h0" })
    }
}
