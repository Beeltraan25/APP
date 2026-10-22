import DupeDiseno
import DupeNucleo
import SwiftUI
import UIKit

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
                case .listo(let ficha, let imagenUrl, let origen, let alternativas):
                    resultado(ficha: ficha, imagenUrl: imagenUrl, origen: origen, alternativas: alternativas)
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

    private func resultado(ficha: FichaPrenda, imagenUrl: URL?, origen: ProductoOrigen?, alternativas: [Alternativa]) -> some View {
        List {
            Section {
                HStack(spacing: Espacio.m) {
                    Group {
                        if let foto = modelo.fotoLocal, let imagen = UIImage(data: foto) {
                            Image(uiImage: imagen).resizable().scaledToFill()
                        } else {
                            ImagenRemota(url: imagenUrl)
                        }
                    }
                    .frame(width: 48, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Tu prenda")
                            .font(.caption.weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        HStack(spacing: Espacio.s) {
                            Circle()
                                .fill(ficha.colorPrincipal.color ?? .gray)
                                .frame(width: 12, height: 12)
                                .overlay(Circle().strokeBorder(.primary.opacity(0.2), lineWidth: 0.5))
                                .accessibilityHidden(true)
                            Text((ficha.subcategoria ?? ficha.categoria).conMayuscula)
                                .font(.headline)
                        }
                        if let origen {
                            Text([origen.tienda.nombre, origen.precio?.formateado].compactMap { $0 }.joined(separator: " · "))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
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
    @Environment(\.dynamicTypeSize) private var tamanoTexto

    var body: some View {
        let producto = alternativa.producto
        // Con texto de accesibilidad, la foto va encima y el texto ocupa todo el ancho.
        let apilado = tamanoTexto.isAccessibilitySize
        let disposicion = apilado
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Espacio.s))
            : AnyLayout(HStackLayout(spacing: Espacio.m))
        disposicion {
            ImagenRemota(url: producto.imagenUrl)
                .frame(width: apilado ? 96 : 56, height: apilado ? 120 : 70)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(producto.marca ?? producto.tienda.nombre)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(producto.titulo)
                    .font(.subheadline)
                    .lineLimit(apilado ? 4 : 2)
                HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                    Text(producto.precio.formateado)
                        .font(.subheadline.weight(.semibold))
                    if apilado, let similitud = alternativa.similitud {
                        porcentaje(similitud.total)
                    }
                }
            }
            if !apilado {
                Spacer(minLength: 0)
                if let similitud = alternativa.similitud {
                    porcentaje(similitud.total)
                }
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func porcentaje(_ total: Int) -> some View {
        Text("\(total) %")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.tint)
            .accessibilityLabel("\(total) % de parecido")
    }
}
