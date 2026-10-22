import SwiftUI

enum Pestana: Hashable {
    case buscar, outfits, guardados
}

/// Las tres pestañas de la app. TabView nativo: adopta Liquid Glass automáticamente.
struct PestanasRaiz: View {
    @Environment(Dependencias.self) private var dependencias
    @State private var seleccion: Pestana = PestanasRaiz.pestanaInicial

    var body: some View {
        TabView(selection: $seleccion) {
            Tab("Buscar", systemImage: "magnifyingglass", value: .buscar) {
                BuscarView(
                    servicio: dependencias.analisis,
                    busqueda: dependencias.busqueda,
                    modoPrueba: dependencias.modoPrueba
                )
            }
            Tab("Outfits", systemImage: "tshirt", value: .outfits) {
                OutfitsView { seleccion = .buscar }
            }
            Tab("Guardados", systemImage: "bookmark", value: .guardados) {
                GuardadosView { seleccion = .buscar }
            }
        }
    }

    private static var pestanaInicial: Pestana {
        switch ModoCaptura.actual {
        case .outfits: .outfits
        case .guardados: .guardados
        default: .buscar
        }
    }
}

#Preview {
    PestanasRaiz()
        .environment(Dependencias.simuladas())
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
