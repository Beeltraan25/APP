import DupeNucleo
import SwiftData
import SwiftUI

/// Prendas guardadas en el iPhone (SwiftData). Guardar se activa en la fase 3.
struct GuardadosView: View {
    let irABuscar: () -> Void

    @Query(sort: \PrendaGuardada.fechaGuardado, order: .reverse)
    private var prendas: [PrendaGuardada]

    var body: some View {
        NavigationStack {
            Group {
                if prendas.isEmpty {
                    ContentUnavailableView {
                        Label("Aún no has guardado nada", systemImage: "bookmark")
                    } description: {
                        Text("Guarda alternativas y outfits para tenerlos siempre a mano.")
                    } actions: {
                        Button("Buscar una prenda", action: irABuscar)
                            .buttonStyle(.glass)
                    }
                } else {
                    List(prendas) { prenda in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(prenda.titulo)
                                .font(.headline)
                            Text("\(prenda.tiendaNombre) · \(Precio(centimos: prenda.precioCentimos).formateado)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Guardados")
        }
    }
}

#Preview {
    GuardadosView {}
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
