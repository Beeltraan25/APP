import SwiftUI

enum Pestana: Hashable {
    case buscar, outfits, guardados
}

/// Las tres pestañas de la app. TabView nativo: adopta Liquid Glass automáticamente.
struct PestanasRaiz: View {
    @Environment(Dependencias.self) private var dependencias
    @Environment(EstadoCompartido.self) private var estado

    var body: some View {
        @Bindable var estado = estado
        TabView(selection: $estado.pestana) {
            Tab("Buscar", systemImage: "magnifyingglass", value: .buscar) {
                BuscarView(
                    servicio: dependencias.analisis,
                    busqueda: dependencias.busqueda,
                    modoPrueba: dependencias.modoPrueba
                )
            }
            Tab("Outfits", systemImage: "tshirt", value: .outfits) {
                OutfitsView(servicio: dependencias.outfits)
            }
            Tab("Guardados", systemImage: "bookmark", value: .guardados) {
                GuardadosView { estado.pestana = .buscar }
            }
        }
    }
}

#Preview {
    PestanasRaiz()
        .environment(Dependencias.simuladas())
        .environment(EstadoCompartido())
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
