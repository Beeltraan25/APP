import DupeNucleo
import Foundation
import SwiftData

/// Base de datos local (SwiftData) de los guardados.
enum Almacen {
    static func crear() -> ModelContainer {
        let esquema = Schema([PrendaGuardada.self, OutfitGuardado.self])
        // En las capturas automáticas: en memoria y, para Guardados, con ejemplos.
        let configuracion = ModelConfiguration(schema: esquema, isStoredInMemoryOnly: ModoCaptura.actual != nil)
        do {
            let contenedor = try ModelContainer(for: esquema, configurations: configuracion)
            if ModoCaptura.actual == .guardados { sembrarEjemplos(en: contenedor.mainContext) }
            return contenedor
        } catch {
            fatalError("No se ha podido abrir la base de datos de guardados: \(error)")
        }
    }

    private static func sembrarEjemplos(en contexto: ModelContext) {
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
