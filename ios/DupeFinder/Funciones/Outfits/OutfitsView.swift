import SwiftUI

/// Fase 1: estado vacío. El generador de outfits llega en la fase 5.
struct OutfitsView: View {
    let irABuscar: () -> Void

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Crea tu primer outfit", systemImage: "tshirt")
            } description: {
                Text("Busca una prenda y elige un estilo: te propondremos tres outfits completos con piezas de tiendas españolas.")
            } actions: {
                Button("Buscar una prenda", action: irABuscar)
                    .buttonStyle(.glassProminent)
            }
            .navigationTitle("Outfits")
        }
    }
}

#Preview {
    OutfitsView {}
}
