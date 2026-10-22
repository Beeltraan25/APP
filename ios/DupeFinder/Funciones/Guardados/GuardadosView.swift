import DupeDiseno
import DupeNucleo
import SwiftData
import SwiftUI

/// Outfits y prendas guardadas en el iPhone (SwiftData). Tocar un outfit muestra sus piezas;
/// tocar una prenda abre la tienda; deslizar borra.
struct GuardadosView: View {
    let irABuscar: () -> Void

    @Environment(\.modelContext) private var contexto
    @Query(sort: \PrendaGuardada.fechaGuardado, order: .reverse)
    private var prendas: [PrendaGuardada]
    @Query(sort: \OutfitGuardado.fechaGuardado, order: .reverse)
    private var outfits: [OutfitGuardado]
    @State private var tiendaAbierta: EnlaceTienda?
    @State private var ruta: [OutfitGuardado] = []

    var body: some View {
        NavigationStack(path: $ruta) {
            Group {
                if prendas.isEmpty && outfits.isEmpty {
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
                        if !outfits.isEmpty {
                            Section("Outfits") {
                                ForEach(outfits) { outfit in
                                    NavigationLink(value: outfit) {
                                        FilaOutfitGuardado(outfit: outfit)
                                    }
                                }
                                .onDelete { indices in
                                    for indice in indices { contexto.delete(outfits[indice]) }
                                }
                            }
                        }
                        if !prendas.isEmpty {
                            Section("Prendas") {
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
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Guardados")
            .navigationDestination(for: OutfitGuardado.self) { outfit in
                DetalleOutfitGuardado(outfit: outfit)
            }
            .task {
                if ModoCaptura.actual == .outfitGuardado, let primero = outfits.first { ruta = [primero] }
            }
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

/// Miniaturas de las piezas, título, estilo y precio total.
private struct FilaOutfitGuardado: View {
    let outfit: OutfitGuardado

    private var piezas: [PiezaGuardada] {
        outfit.piezas.sorted { $0.orden < $1.orden }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Espacio.s) {
            HStack(spacing: 6) {
                ForEach(piezas.prefix(4)) { pieza in
                    ImagenRemota(url: pieza.imagenUrl)
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(outfit.titulo.isEmpty ? "Outfit" : outfit.titulo)
                        .font(.headline)
                    Text(outfit.estilo.conMayuscula)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(Precio(centimos: outfit.precioTotalCentimos).formateado)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    GuardadosView {}
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
