import DupeDiseno
import DupeNucleo
import SwiftUI
import UIKit

/// Un outfit: collage de piezas (fotos limpias, sin vidrio), título, precio total y por qué encaja.
struct TarjetaOutfit: View {
    let outfit: Outfit
    /// La foto que hizo el usuario de su prenda (si la hay).
    let fotoBase: Data?
    let guardado: Bool
    let alTocarPieza: (PiezaOutfit) -> Void
    let alCambiarPieza: (PiezaOutfit) -> Void
    let alGuardar: () -> Void

    private let columnas = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: columnas, spacing: 10) {
                ForEach(outfit.piezas) { pieza in
                    celda(pieza)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Text(outfit.titulo)
                    .font(.title3.bold())
                Spacer(minLength: Espacio.s)
                Text(outfit.precioTotal.formateado)
                    .font(.headline)
            }

            Text(outfit.porQueEncaja)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Text("Mantén pulsada una prenda para cambiarla")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer(minLength: 0)
                Button(action: alGuardar) {
                    Image(systemName: guardado ? "bookmark.fill" : "bookmark")
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.glass)
                .accessibilityLabel(guardado ? "Quitar de guardados" : "Guardar outfit")
                .sensoryFeedback(.success, trigger: guardado)
            }
        }
        .padding(14)
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func celda(_ pieza: PiezaOutfit) -> some View {
        Button { alTocarPieza(pieza) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay { imagen(pieza) }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                Text(pieza.esPrendaBase ? "Tu prenda" : (pieza.producto?.marca ?? pieza.producto?.tienda.nombre ?? pieza.rol.titulo))
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(pieza.esPrendaBase ? " " : (pieza.producto?.precio?.formateado ?? " "))
                    .font(.caption.weight(.semibold))
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        // Sin .disabled en la prenda base: atenuaría su foto. Tocarla no hace nada (no tiene tienda).
        .contextMenu {
            if !pieza.esPrendaBase {
                Button("Cambiar esta prenda", systemImage: "arrow.triangle.2.circlepath") { alCambiarPieza(pieza) }
                if pieza.producto != nil {
                    Button("Ver en tienda", systemImage: "safari") { alTocarPieza(pieza) }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(etiquetaAccesible(pieza))
        .accessibilityAction(named: "Cambiar esta prenda") {
            if !pieza.esPrendaBase { alCambiarPieza(pieza) }
        }
    }

    @ViewBuilder
    private func imagen(_ pieza: PiezaOutfit) -> some View {
        if pieza.esPrendaBase, let fotoBase, let imagen = UIImage(data: fotoBase) {
            Image(uiImage: imagen).resizable().scaledToFill()
        } else {
            ImagenRemota(url: pieza.imagenUrl)
        }
    }

    private func etiquetaAccesible(_ pieza: PiezaOutfit) -> String {
        if pieza.esPrendaBase { return "Tu prenda: \(pieza.descripcion)" }
        let partes = [pieza.rol.titulo, pieza.producto?.titulo, pieza.producto?.tienda.nombre, pieza.producto?.precio?.formateado]
        return partes.compactMap { $0 }.joined(separator: ", ")
    }
}
