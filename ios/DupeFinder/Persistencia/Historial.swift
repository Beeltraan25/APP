import CryptoKit
import DupeDiseno
import DupeNucleo
import Foundation
import SwiftData
import UIKit

/// Cada prenda que se analiza (foto o enlace), para volver a ella sin hacer otra foto.
@Model
final class PrendaBuscada {
    #Unique<PrendaBuscada>([\.huella])

    /// Foto: SHA-256 del JPEG. Enlace: la dirección del producto.
    var huella: String
    /// "Vaqueros azul claro"
    var titulo: String
    /// La foto tal como se envió (JPEG de ~1024 px). Nil si era un enlace.
    @Attribute(.externalStorage) var foto: Data?
    /// Miniatura pequeña para las listas.
    var miniatura: Data?
    /// Imagen de la tienda (enlaces) o la del servidor.
    var imagenUrl: URL?
    /// RespuestaAnalisis en JSON: la ficha y lo demás para reabrirla tal cual.
    var respuesta: Data
    /// Cuándo se analizó: la foto en el servidor caduca a las 24 h.
    var fechaAnalisis: Date
    /// Última vez que se usó (el historial va de la más reciente a la más antigua).
    var fechaUso: Date

    init(
        huella: String,
        titulo: String,
        foto: Data?,
        miniatura: Data?,
        imagenUrl: URL?,
        respuesta: Data,
        fechaAnalisis: Date = .now,
        fechaUso: Date = .now
    ) {
        self.huella = huella
        self.titulo = titulo
        self.foto = foto
        self.miniatura = miniatura
        self.imagenUrl = imagenUrl
        self.respuesta = respuesta
        self.fechaAnalisis = fechaAnalisis
        self.fechaUso = fechaUso
    }

    /// Era una foto y el servidor ya la ha borrado: hay que volver a analizarla para buscar con ella.
    var caducada: Bool {
        foto != nil && Date.now.timeIntervalSince(fechaAnalisis) > Historial.vigencia
    }

    /// Para abrir otra vez la ficha.
    func analisis() -> AnalisisPresentado? {
        guard let respuesta = try? JSONDecoder().decode(RespuestaAnalisis.self, from: respuesta) else { return nil }
        return AnalisisPresentado(respuesta: respuesta, foto: foto, reabierto: true)
    }
}

/// Guarda en el historial cada análisis (sin repetir la misma foto o el mismo enlace).
enum Historial {
    /// Las más antiguas se borran solas a partir de aquí.
    nonisolated static let maximo = 60
    /// El servidor guarda la foto 24 h; con margen, a las 23 h se considera caducada.
    nonisolated static let vigencia: TimeInterval = 23 * 3600

    static func huella(de analisis: AnalisisPresentado) -> String {
        if let foto = analisis.foto {
            return SHA256.hash(data: foto).map { String(format: "%02x", $0) }.joined()
        }
        let respuesta = analisis.respuesta
        return respuesta.productoOrigen?.url.absoluteString ?? respuesta.imagenUrl?.absoluteString ?? respuesta.analisisId
    }

    static func titulo(de ficha: FichaPrenda) -> String {
        "\(ficha.categoria.conMayuscula) \(ficha.colorPrincipal.nombre.lowercased())"
    }

    static func registrar(_ analisis: AnalisisPresentado, en contexto: ModelContext) {
        let huella = huella(de: analisis)
        let existente = try? contexto.fetch(FetchDescriptor<PrendaBuscada>(predicate: #Predicate { $0.huella == huella })).first

        // Reabrir una del historial solo la sube arriba.
        if analisis.reabierto {
            existente?.fechaUso = .now
            return
        }
        guard let datos = try? JSONEncoder().encode(analisis.respuesta) else { return }
        let respuesta = analisis.respuesta
        let imagen = respuesta.productoOrigen?.imagenUrl ?? respuesta.imagenUrl

        if let existente {
            existente.titulo = titulo(de: respuesta.ficha)
            existente.respuesta = datos
            existente.imagenUrl = imagen
            existente.fechaAnalisis = .now
            existente.fechaUso = .now
        } else {
            contexto.insert(
                PrendaBuscada(
                    huella: huella,
                    titulo: titulo(de: respuesta.ficha),
                    foto: analisis.foto,
                    miniatura: analisis.foto.flatMap(miniatura(de:)),
                    imagenUrl: imagen,
                    respuesta: datos
                )
            )
            // Se guarda antes de recortar: así la consulta ve la nueva sin depender de los cambios pendientes.
            try? contexto.save()
            recortar(contexto)
        }
        try? contexto.save()
    }

    /// Deja solo las `maximo` más recientes.
    static func recortar(_ contexto: ModelContext) {
        var descriptor = FetchDescriptor<PrendaBuscada>(sortBy: [SortDescriptor(\.fechaUso, order: .reverse)])
        descriptor.fetchOffset = maximo
        for sobrante in (try? contexto.fetch(descriptor)) ?? [] {
            contexto.delete(sobrante)
        }
    }

    /// JPEG de 300 px como mucho por el lado largo.
    static func miniatura(de foto: Data) -> Data? {
        guard let imagen = UIImage(data: foto) else { return nil }
        let escala = min(1, 300 / max(imagen.size.width, imagen.size.height))
        let tamano = CGSize(width: imagen.size.width * escala, height: imagen.size.height * escala)
        return imagen.preparingThumbnail(of: tamano)?.jpegData(compressionQuality: 0.75)
    }
}
