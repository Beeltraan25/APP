import DupeDiseno
import DupeNucleo
import SwiftUI

/// Tarjeta limpia: foto sin vidrio, tienda, precio, % de similitud y 2–3 etiquetas.
struct TarjetaAlternativa: View {
    let alternativa: Alternativa
    /// Lo que cuesta la prenda original, para enseñar cuánto se ahorra.
    var precioOriginal: Precio? = nil

    var body: some View {
        let producto = alternativa.producto
        VStack(alignment: .leading, spacing: 6) {
            Color.clear
                .aspectRatio(3 / 4, contentMode: .fit)
                .overlay { ImagenRemota(url: producto.imagenUrl) }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            Text(producto.marca ?? producto.tienda.nombre)
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.4)
                .foregroundStyle(.secondary)
                .padding(.top, 2)

            Text(producto.titulo)
                .font(.subheadline)
                .lineLimit(2, reservesSpace: true)

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(producto.precio.formateado)
                    .font(.subheadline.weight(.semibold))
                if let anterior = producto.precioAnterior {
                    Text(anterior.formateado)
                        .font(.caption)
                        .strikethrough()
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if let similitud = alternativa.similitud {
                    Text("\(similitud.total) %")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tint)
                        .accessibilityLabel("\(similitud.total) % de parecido")
                }
            }

            if let ahorro = ahorro(de: producto) {
                Text("Ahorras \(ahorro.formateado)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
            }

            // En la tarjeta caben 2 etiquetas; el detalle las muestra todas.
            if !alternativa.etiquetas.isEmpty {
                FlujoChips(espacio: 4) {
                    ForEach(alternativa.etiquetas.prefix(2), id: \.texto) { etiqueta in
                        EtiquetaSimilitud(etiqueta, compacta: true)
                    }
                }
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre el detalle")
    }

    private func ahorro(de producto: Producto) -> Precio? {
        guard let original = precioOriginal, original.moneda == producto.precio.moneda,
              original.centimos > producto.precio.centimos
        else { return nil }
        return Precio(centimos: original.centimos - producto.precio.centimos, moneda: original.moneda)
    }
}
