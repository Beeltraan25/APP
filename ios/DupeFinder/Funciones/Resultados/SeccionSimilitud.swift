import DupeDiseno
import DupeNucleo
import SwiftUI

/// "87 % de parecido", las etiquetas y el desglose por criterio (aspecto, color, gramaje…).
struct SeccionSimilitud: View {
    let similitud: Similitud
    let etiquetas: [Etiqueta]

    var body: some View {
        VStack(alignment: .leading, spacing: Espacio.m) {
            HStack(alignment: .firstTextBaseline, spacing: Espacio.s) {
                Text("\(similitud.total) %")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.tint)
                Text("de parecido")
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)

            if !etiquetas.isEmpty {
                FlujoChips(espacio: 6) {
                    ForEach(etiquetas, id: \.texto) { EtiquetaSimilitud($0) }
                }
            }

            VStack(spacing: 10) {
                ForEach(similitud.criterios, id: \.criterio) { criterio in
                    FilaCriterio(criterio: criterio)
                }
            }

            if similitud.criterios.contains(where: { !$0.disponible }) {
                Text("Sin datos: no se ha podido saber con la información de la tienda. Su peso se reparte entre los demás.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(Espacio.m)
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct FilaCriterio: View {
    let criterio: CriterioSimilitud

    var body: some View {
        HStack(spacing: Espacio.m) {
            Text(criterio.titulo)
                .font(.subheadline)
                .frame(width: 80, alignment: .leading)
            if let puntuacion = criterio.puntuacion, criterio.disponible {
                ProgressView(value: Double(puntuacion), total: 100)
                Text("\(puntuacion)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 30, alignment: .trailing)
            } else {
                Text("Sin datos")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                Spacer()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            criterio.disponible
                ? "\(criterio.titulo): \(criterio.puntuacion ?? 0) de 100"
                : "\(criterio.titulo): sin datos"
        )
    }
}

#Preview {
    let alternativa = DatosSimulados.busqueda.alternativas[2]
    return ScrollView {
        SeccionSimilitud(similitud: alternativa.similitud!, etiquetas: alternativa.etiquetas)
            .padding()
    }
}
