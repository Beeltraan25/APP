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
            if ModoCaptura.actual == .guardados || ModoCaptura.actual == .outfitGuardado { sembrarEjemplos(en: contenedor.mainContext) }
            return contenedor
        } catch {
            fatalError("No se ha podido abrir la base de datos de guardados: \(error)")
        }
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
