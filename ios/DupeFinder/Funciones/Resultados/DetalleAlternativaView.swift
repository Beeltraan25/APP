import DupeDiseno
import DupeNucleo
import SwiftData
import SwiftUI

/// Detalle de una alternativa: "Ver en tienda" (Safari dentro de la app) y "Guardar".
struct DetalleAlternativaView: View {
    let alternativa: Alternativa

    @Environment(\.modelContext) private var contexto
    @Query private var guardadas: [PrendaGuardada]
    @State private var mostrandoTienda = false

    init(alternativa: Alternativa) {
        self.alternativa = alternativa
        let id = alternativa.producto.id
        _guardadas = Query(filter: #Predicate<PrendaGuardada> { $0.productoId == id })
    }

    private var estaGuardada: Bool { !guardadas.isEmpty }

    var body: some View {
        let producto = alternativa.producto
        ScrollView {
            VStack(alignment: .leading, spacing: Espacio.l) {
                // 4:5 (y no 3:4) para que precio y rango se vean sin desplazarse.
                Color.clear
                    .aspectRatio(4 / 5, contentMode: .fit)
                    .overlay { ImagenRemota(url: producto.imagenUrl) }
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

                VStack(alignment: .leading, spacing: Espacio.s) {
                    Text(producto.tienda.nombre)
                        .font(.footnote.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(0.4)
                        .foregroundStyle(.secondary)
                    if let marca = producto.marca, marca != producto.tienda.nombre {
                        Text(marca).font(.headline)
                    }
                    Text(producto.titulo)
                        .font(.title2.bold())
                    HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                        Text(producto.precio.formateado)
                            .font(.title3.weight(.semibold))
                        if let anterior = producto.precioAnterior {
                            Text(anterior.formateado)
                                .strikethrough()
                                .foregroundStyle(.secondary)
                        }
                    }
                    HStack(spacing: Espacio.s) {
                        if let similitud = alternativa.similitud {
                            Text("\(similitud.total) % de parecido")
                                .fontWeight(.semibold)
                                .foregroundStyle(.tint)
                            Text("·").foregroundStyle(.tertiary)
                        }
                        Text("\(producto.rango.titulo) · \(producto.rango.descripcion)")
                            .foregroundStyle(.secondary)
                    }
                    .font(.subheadline)
                }

                if let similitud = alternativa.similitud {
                    SeccionSimilitud(similitud: similitud, etiquetas: alternativa.etiquetas)
                }

                if alternativa.abreGoogleShopping {
                    Label(
                        "Te llevaremos a Google Shopping, donde verás la oferta de \(producto.tienda.nombre).",
                        systemImage: "info.circle"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, Espacio.xl)
        }
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaBar(edge: .bottom) { botones }
        .sheet(isPresented: $mostrandoTienda) {
            NavegadorTienda(url: producto.url)
                .ignoresSafeArea()
        }
        .sensoryFeedback(.success, trigger: estaGuardada)
    }

    private var botones: some View {
        HStack(spacing: Espacio.s) {
            Button { mostrandoTienda = true } label: {
                Label("Ver en tienda", systemImage: "safari")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)

            Button { alternarGuardado() } label: {
                Image(systemName: estaGuardada ? "bookmark.fill" : "bookmark")
                    .font(.headline)
                    .padding(.vertical, 6)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.glass)
            .accessibilityLabel(estaGuardada ? "Quitar de guardados" : "Guardar")
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .padding(.bottom, Espacio.s)
    }

    private func alternarGuardado() {
        if let guardada = guardadas.first {
            contexto.delete(guardada)
            return
        }
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
                similitud: alternativa.similitud?.total,
                etiquetas: alternativa.etiquetas.map(\.texto)
            )
        )
    }
}

#Preview {
    NavigationStack {
        DetalleAlternativaView(alternativa: DatosSimulados.busqueda.alternativas[2])
    }
    .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
