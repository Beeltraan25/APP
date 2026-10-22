import DupeDiseno
import DupeNucleo
import SwiftUI

/// Tarjeta limpia: foto sin vidrio, tienda, precio, % de similitud y 2–3 etiquetas.
struct TarjetaAlternativa: View {
    let alternativa: Alternativa

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
                }
            }

            if !alternativa.etiquetas.isEmpty {
                FlujoChips(espacio: 4) {
                    ForEach(alternativa.etiquetas.prefix(3), id: \.texto) { etiqueta in
                        Text(etiqueta.texto)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(.fill.tertiary, in: .capsule)
                    }
                }
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Abre el detalle")
    }
}
