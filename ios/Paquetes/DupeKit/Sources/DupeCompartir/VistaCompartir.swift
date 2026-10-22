import DupeDiseno
import DupeNucleo
import SwiftUI

/// La pantalla de la Share Extension: lee lo compartido, analiza y muestra las mejores alternativas.
public struct VistaCompartir: View {
    @State private var modelo: ModeloCompartir
    @State private var tiendaAbierta: EnlaceTienda?
    private let alCerrar: () -> Void

    public init(modelo: ModeloCompartir, alCerrar: @escaping () -> Void) {
        _modelo = State(initialValue: modelo)
        self.alCerrar = alCerrar
    }

    public var body: some View {
        NavigationStack {
            Group {
                switch modelo.fase {
                case .leyendo:
                    progreso("Leyendo la prenda…")
                case .analizando:
                    progreso("Analizando la prenda…")
                case .buscando:
                    progreso("Buscando alternativas…")
                case .error(let mensaje):
                    ContentUnavailableView("No ha podido ser", systemImage: "exclamationmark.triangle", description: Text(mensaje))
                case .listo(let ficha, let origen, let alternativas):
                    resultado(ficha: ficha, origen: origen, alternativas: alternativas)
                }
            }
            .navigationTitle("Dupe Finder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", systemImage: "xmark", action: alCerrar)
                }
            }
        }
        .sheet(item: $tiendaAbierta) { enlace in
            NavegadorTienda(url: enlace.url).ignoresSafeArea()
        }
    }

    /// Progreso discreto, sin pantalla de carga completa.
    private func progreso(_ texto: String) -> some View {
        VStack(spacing: Espacio.m) {
            ProgressView()
            Text(texto)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .contentTransition(.opacity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .animation(.smooth, value: texto)
    }

    private func resultado(ficha: FichaPrenda, origen: ProductoOrigen?, alternativas: [Alternativa]) -> some View {
        List {
            Section {
                HStack(spacing: Espacio.s) {
                    Circle()
                        .fill(ficha.colorPrincipal.color ?? .gray)
                        .frame(width: 14, height: 14)
                        .overlay(Circle().strokeBorder(.primary.opacity(0.2), lineWidth: 0.5))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text((ficha.subcategoria ?? ficha.categoria).conMayuscula)
                            .font(.headline)
                        if let origen {
                            Text([origen.tienda.nombre, origen.precio?.formateado].compactMap { $0 }.joined(separator: " · "))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section {
                if alternativas.isEmpty {
                    Text("No hemos encontrado alternativas en las tiendas de la lista.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(alternativas) { alternativa in
                        Button { tiendaAbierta = EnlaceTienda(url: alternativa.producto.url) } label: {
                            FilaAlternativa(alternativa: alternativa)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Abre la tienda")
                    }
                }
            } header: {
                Text("Alternativas")
            } footer: {
                Text(
                    modelo.modoPrueba
                        ? "Modo de prueba: no hay servidor configurado."
                        : "Para guardarlas o crear outfits, abre Dupe Finder y busca la prenda."
                )
            }
        }
    }
}

private struct FilaAlternativa: View {
    let alternativa: Alternativa

    var body: some View {
        let producto = alternativa.producto
        HStack(spacing: Espacio.m) {
            ImagenRemota(url: producto.imagenUrl)
                .frame(width: 56, height: 70)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(producto.marca ?? producto.tienda.nombre)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(producto.titulo)
                    .font(.subheadline)
                    .lineLimit(2)
                Text(producto.precio.formateado)
                    .font(.subheadline.weight(.semibold))
            }
            Spacer(minLength: 0)
            if let similitud = alternativa.similitud {
                Text("\(similitud.total) %")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.tint)
                    .accessibilityLabel("\(similitud.total) % de parecido")
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
