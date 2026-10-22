import DupeDiseno
import DupeNucleo
import SwiftData
import SwiftUI

/// Prendas guardadas en el iPhone (SwiftData). Tocar una abre la tienda; deslizar la borra.
struct GuardadosView: View {
    let irABuscar: () -> Void

    @Environment(\.modelContext) private var contexto
    @Query(sort: \PrendaGuardada.fechaGuardado, order: .reverse)
    private var prendas: [PrendaGuardada]
    @State private var tiendaAbierta: EnlaceTienda?

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
                    List {
                        ForEach(prendas) { prenda in
                            Button { tiendaAbierta = EnlaceTienda(url: prenda.url) } label: {
                                FilaGuardada(prenda: prenda)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Abre la tienda")
                        }
                        .onDelete { indices in
                            for indice in indices { contexto.delete(prendas[indice]) }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Guardados")
            .sheet(item: $tiendaAbierta) { enlace in
                NavegadorTienda(url: enlace.url).ignoresSafeArea()
            }
        }
    }
}

private struct FilaGuardada: View {
    let prenda: PrendaGuardada

    var body: some View {
        HStack(spacing: Espacio.m) {
            ImagenRemota(url: prenda.imagenUrl)
                .frame(width: 60, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(prenda.marca ?? prenda.tiendaNombre)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(prenda.titulo)
                    .font(.subheadline)
                    .lineLimit(2)
                Text(Precio(centimos: prenda.precioCentimos).formateado)
                    .font(.subheadline.weight(.semibold))
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    GuardadosView {}
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
