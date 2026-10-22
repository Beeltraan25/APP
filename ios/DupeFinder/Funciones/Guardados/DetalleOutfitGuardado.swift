import DupeDiseno
import DupeNucleo
import SwiftUI

/// Un outfit guardado: por qué encaja y sus piezas, cada una con enlace a su tienda.
struct DetalleOutfitGuardado: View {
    let outfit: OutfitGuardado

    @State private var tiendaAbierta: EnlaceTienda?

    private var piezas: [PiezaGuardada] {
        outfit.piezas.sorted { $0.orden < $1.orden }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Espacio.s) {
                    Text(outfit.estilo.conMayuscula)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.tint)
                    if !outfit.porQueEncaja.isEmpty {
                        Text(outfit.porQueEncaja)
                            .font(.body)
                    }
                    LabeledContent("Total", value: Precio(centimos: outfit.precioTotalCentimos).formateado)
                        .font(.headline)
                }
                .padding(.vertical, 4)
            }

            Section("Piezas") {
                ForEach(piezas) { pieza in
                    if let url = pieza.url {
                        Button { tiendaAbierta = EnlaceTienda(url: url) } label: {
                            FilaPieza(pieza: pieza, conEnlace: true)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Abre la tienda")
                    } else {
                        FilaPieza(pieza: pieza, conEnlace: false)
                    }
                }
            }
        }
        .navigationTitle(outfit.titulo.isEmpty ? "Outfit" : outfit.titulo)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $tiendaAbierta) { enlace in
            NavegadorTienda(url: enlace.url).ignoresSafeArea()
        }
    }
}

private struct FilaPieza: View {
    let pieza: PiezaGuardada
    let conEnlace: Bool

    private var rol: String {
        RolPieza(rawValue: pieza.rol)?.titulo ?? pieza.rol.conMayuscula
    }

    var body: some View {
        HStack(spacing: Espacio.m) {
            ImagenRemota(url: pieza.imagenUrl)
                .frame(width: 60, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(pieza.esPrendaBase ? "\(rol) · Tu prenda" : rol)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(pieza.titulo)
                    .font(.subheadline)
                    .lineLimit(2)
                let precio = pieza.precioCentimos > 0 ? Precio(centimos: pieza.precioCentimos).formateado : nil
                let datos = [pieza.tiendaNombre.isEmpty ? nil : pieza.tiendaNombre, precio].compactMap { $0 }
                if !datos.isEmpty {
                    Text(datos.joined(separator: " · "))
                        .font(.subheadline)
                }
            }
            Spacer(minLength: 0)
            if conEnlace {
                Image(systemName: "arrow.up.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
