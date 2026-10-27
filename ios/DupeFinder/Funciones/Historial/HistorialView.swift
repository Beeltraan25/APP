import DupeDiseno
import DupeNucleo
import SwiftData
import SwiftUI
import UIKit

/// Todas las prendas que has buscado. Tocar una abre su ficha otra vez; mantener pulsado, borrarla.
struct HistorialView: View {
    @Environment(\.modelContext) private var contexto
    @Environment(EstadoCompartido.self) private var estado
    @Query(sort: \PrendaBuscada.fechaUso, order: .reverse) private var prendas: [PrendaBuscada]
    @State private var confirmandoBorrado = false

    private let columnas = [GridItem(.adaptive(minimum: 104), spacing: Espacio.s, alignment: .top)]

    var body: some View {
        Group {
            if prendas.isEmpty {
                ContentUnavailableView(
                    "Sin fotos todavía",
                    systemImage: "photo.stack",
                    description: Text("Aquí aparecerán las prendas que busques.")
                )
            } else {
                ScrollView {
                    LazyVGrid(columns: columnas, spacing: Espacio.m) {
                        ForEach(prendas) { prenda in
                            Button { estado.reabrir(prenda) } label: {
                                CeldaHistorial(prenda: prenda, ancho: nil)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Borrar", systemImage: "trash", role: .destructive) { contexto.delete(prenda) }
                            }
                        }
                    }
                    .padding(Espacio.m)
                }
            }
        }
        .navigationTitle("Tus fotos")
        .toolbar {
            if !prendas.isEmpty {
                Button("Borrar todo", role: .destructive) { confirmandoBorrado = true }
            }
        }
        .confirmationDialog("¿Borrar todas las fotos del historial?", isPresented: $confirmandoBorrado, titleVisibility: .visible) {
            Button("Borrar todo", role: .destructive) {
                for prenda in prendas { contexto.delete(prenda) }
            }
        } message: {
            Text("Tus prendas y outfits guardados no se borran.")
        }
    }
}

/// Las últimas fotos en una fila que se desliza. No se muestra si no hay ninguna.
struct TiraHistorial: View {
    @Environment(EstadoCompartido.self) private var estado
    @Query private var prendas: [PrendaBuscada]
    private let verTodo: () -> Void

    init(limite: Int = 12, verTodo: @escaping () -> Void) {
        var descriptor = FetchDescriptor<PrendaBuscada>(sortBy: [SortDescriptor(\.fechaUso, order: .reverse)])
        descriptor.fetchLimit = limite
        _prendas = Query(descriptor)
        self.verTodo = verTodo
    }

    var body: some View {
        if !prendas.isEmpty {
            VStack(alignment: .leading, spacing: Espacio.s) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Tus fotos")
                        .font(.headline)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Button("Ver todo", action: verTodo)
                        .font(.subheadline)
                        // Dentro de una List, sin esto el botón se activa al tocar cualquier parte de la fila.
                        .buttonStyle(.borderless)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: Espacio.s) {
                        ForEach(prendas) { prenda in
                            Button { estado.reabrir(prenda) } label: {
                                CeldaHistorial(prenda: prenda, ancho: 84)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
    }
}

/// Miniatura + nombre + cuándo.
struct CeldaHistorial: View {
    let prenda: PrendaBuscada
    /// Nil = ocupa el ancho de la columna.
    let ancho: CGFloat?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Color.clear
                .aspectRatio(4 / 5, contentMode: .fit)
                .overlay { MiniaturaHistorial(prenda: prenda) }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text(prenda.titulo)
                .font(.caption.weight(.medium))
                .lineLimit(2)
            Text(prenda.fechaUso, format: .relative(presentation: .named))
                .font(.caption2)
                .lineLimit(1)
                .foregroundStyle(.secondary)
        }
        .frame(width: ancho, alignment: .leading)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre su ficha para buscar otra vez")
    }
}

private struct MiniaturaHistorial: View {
    let prenda: PrendaBuscada

    var body: some View {
        if let datos = prenda.miniatura, let imagen = UIImage(data: datos) {
            Image(uiImage: imagen)
                .resizable()
                .scaledToFill()
        } else {
            ImagenRemota(url: prenda.imagenUrl)
        }
    }
}
