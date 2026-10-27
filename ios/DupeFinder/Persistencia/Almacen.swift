import DupeNucleo
import Foundation
import SwiftData
import UIKit

/// Base de datos local (SwiftData) de los guardados y del historial de fotos.
enum Almacen {
    static func crear() -> ModelContainer {
        let esquema = Schema([PrendaGuardada.self, OutfitGuardado.self, PrendaBuscada.self])
        // En las capturas automáticas: en memoria y, para Guardados, con ejemplos.
        let configuracion = ModelConfiguration(schema: esquema, isStoredInMemoryOnly: ModoCaptura.actual != nil)
        do {
            let contenedor = try ModelContainer(for: esquema, configurations: configuracion)
            if ModoCaptura.actual == .guardados || ModoCaptura.actual == .outfitGuardado { sembrarEjemplos(en: contenedor.mainContext) }
            if [.inicio, .guardados, .historial].contains(ModoCaptura.actual) { sembrarHistorial(en: contenedor.mainContext) }
            return contenedor
        } catch {
            fatalError("No se ha podido abrir la base de datos de guardados: \(error)")
        }
    }

    /// Fotos de ejemplo (dibujadas aquí: en la integración continua no hay fotos de verdad).
    private static func sembrarHistorial(en contexto: ModelContext) {
        let ejemplos: [(String, UIColor, String)] = [
            ("Vaqueros azul claro", UIColor(red: 0.55, green: 0.68, blue: 0.82, alpha: 1), "figure.walk"),
            ("Sudadera gris marengo", UIColor(white: 0.35, alpha: 1), "tshirt.fill"),
            ("Camisa blanco roto", UIColor(red: 0.93, green: 0.91, blue: 0.86, alpha: 1), "tshirt"),
            ("Chaqueta verde oliva", UIColor(red: 0.42, green: 0.45, blue: 0.27, alpha: 1), "jacket.fill"),
            ("Zapatillas blanco", UIColor(white: 0.96, alpha: 1), "shoe.fill"),
        ]
        let respuesta = (try? JSONEncoder().encode(DatosSimulados.analisisFoto)) ?? Data()
        for (indice, (titulo, color, simbolo)) in ejemplos.enumerated() {
            let foto = fotoDeEjemplo(color: color, simbolo: simbolo)
            contexto.insert(
                PrendaBuscada(
                    huella: "ejemplo-\(indice)",
                    titulo: titulo,
                    foto: foto,
                    miniatura: foto.flatMap(Historial.miniatura(de:)),
                    imagenUrl: nil,
                    respuesta: respuesta,
                    fechaAnalisis: .now.addingTimeInterval(Double(-indice) * 26 * 3600),
                    fechaUso: .now.addingTimeInterval(Double(-indice) * 26 * 3600)
                )
            )
        }
    }

    private static func fotoDeEjemplo(color: UIColor, simbolo: String) -> Data? {
        let tamano = CGSize(width: 400, height: 500)
        let imagen = UIGraphicsImageRenderer(size: tamano).image { _ in
            color.setFill()
            UIRectFill(CGRect(origin: .zero, size: tamano))
            let configuracion = UIImage.SymbolConfiguration(pointSize: 160, weight: .regular)
            if let icono = UIImage(systemName: simbolo, withConfiguration: configuracion)?
                .withTintColor(.white.withAlphaComponent(0.85), renderingMode: .alwaysOriginal) {
                icono.draw(at: CGPoint(x: (tamano.width - icono.size.width) / 2, y: (tamano.height - icono.size.height) / 2))
            }
        }
        return imagen.jpegData(compressionQuality: 0.8)
    }

    private static func sembrarEjemplos(en contexto: ModelContext) {
        if let outfit = DatosSimulados.outfits.outfits.first {
            let guardado = OutfitGuardado(
                outfitId: outfit.id,
                titulo: outfit.titulo,
                estilo: "old money",
                porQueEncaja: outfit.porQueEncaja,
                precioTotalCentimos: outfit.precioTotal.centimos
            )
            contexto.insert(guardado)
            for (orden, pieza) in outfit.piezas.enumerated() {
                let guardada = PiezaGuardada(
                    orden: orden,
                    rol: pieza.rol.rawValue,
                    esPrendaBase: pieza.esPrendaBase,
                    productoId: pieza.producto?.id ?? "base",
                    titulo: pieza.producto?.titulo ?? pieza.descripcion,
                    tiendaNombre: pieza.producto?.tienda.nombre ?? "",
                    url: pieza.producto?.url,
                    imagenUrl: pieza.imagenUrl,
                    precioCentimos: pieza.producto?.precio?.centimos ?? 0
                )
                guardada.outfit = guardado
                contexto.insert(guardada)
            }
        }
        for (indice, alternativa) in DatosSimulados.busqueda.alternativas.prefix(3).enumerated() {
            let producto = alternativa.producto
            contexto.insert(
                PrendaGuardada(
                    productoId: producto.id,
                    titulo: producto.titulo,
                    tiendaNombre: producto.tienda.nombre,
                    marca: producto.marca,
                    url: producto.url,
                    imagenUrl: producto.imagenUrl,
                    precioCentimos: producto.precio.centimos,
                    fechaGuardado: .now.addingTimeInterval(Double(-indice) * 3600)
                )
            )
        }
    }
}
