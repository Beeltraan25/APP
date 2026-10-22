import DupeDiseno
import DupeNucleo
import SwiftUI

/// Otras opciones para una pieza del outfit, dentro del mismo presupuesto.
struct CambiarPiezaSheet: View {
    let cambio: PiezaACambiar
    let presupuesto: PresupuestoPorPrenda
    let excluir: [String]
    let servicio: any ServicioOutfits
    let alElegir: (Producto) -> Void

    @Environment(\.dismiss) private var cerrar
    @State private var estado: EstadoCarga<[Producto]> = .inactivo

    private let columnas = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Espacio.m) {
                    Text(cambio.pieza.descripcion.conMayuscula)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    contenido
                }
                .padding(.horizontal, 20)
                .padding(.bottom, Espacio.l)
            }
            .navigationTitle("Cambiar \(cambio.pieza.rol.titulo.lowercased())")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", systemImage: "xmark") { cerrar() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await cargar() }
    }

    @ViewBuilder
    private var contenido: some View {
        switch estado {
        case .inactivo, .cargando:
            LazyVGrid(columns: columnas, spacing: Espacio.m) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(.fill.tertiary)
                        .aspectRatio(1, contentMode: .fit)
                }
            }
            .accessibilityLabel("Buscando opciones")
        case .error(let error):
            ContentUnavailableView("No ha podido ser", systemImage: "exclamationmark.triangle", description: Text(error.mensaje))
        case .listo(let opciones) where opciones.isEmpty:
            ContentUnavailableView(
                "Sin más opciones",
                systemImage: "tshirt",
                description: Text("No hay otras prendas parecidas dentro del presupuesto.")
            )
        case .listo(let opciones):
            LazyVGrid(columns: columnas, spacing: Espacio.l) {
                ForEach(opciones) { producto in
                    Button {
                        alElegir(producto)
                        cerrar()
                    } label: {
                        opcion(producto)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func opcion(_ producto: Producto) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay { ImagenRemota(url: producto.imagenUrl) }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            Text(producto.marca ?? producto.tienda.nombre)
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Text(producto.titulo)
                .font(.footnote)
                .lineLimit(2, reservesSpace: true)
            Text(producto.precio.formateado)
                .font(.footnote.weight(.semibold))
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Usar en el outfit")
    }

    private func cargar() async {
        guard case .inactivo = estado, let consulta = cambio.pieza.consulta else {
            if cambio.pieza.consulta == nil { estado = .listo([]) }
            return
        }
        estado = .cargando
        do {
            estado = .listo(try await servicio.cambiarPieza(consulta: consulta, presupuesto: presupuesto, excluir: excluir))
        } catch let error as ErrorApp {
            estado = .error(error)
        } catch {
            estado = .error(.desconocido)
        }
    }
}
