import SwiftUI

/// Etiqueta pequeña para mostrar un dato de la ficha. Sin vidrio: va sobre el contenido.
public struct Chip: View {
    private let valor: String
    private let titulo: String?
    private let estimado: Bool
    private let muestra: Color?
    private let alQuitar: (() -> Void)?

    /// - Parameters:
    ///   - titulo: texto secundario delante del valor ("Material").
    ///   - estimado: muestra un destello: el dato lo ha deducido la IA.
    ///   - muestra: círculo de color delante del texto.
    ///   - alQuitar: si se indica, añade un botón para quitar el chip.
    public init(
        _ valor: String,
        titulo: String? = nil,
        estimado: Bool = false,
        muestra: Color? = nil,
        alQuitar: (() -> Void)? = nil
    ) {
        self.valor = valor
        self.titulo = titulo
        self.estimado = estimado
        self.muestra = muestra
        self.alQuitar = alQuitar
    }

    public var body: some View {
        HStack(spacing: 6) {
            if let muestra {
                Circle()
                    .fill(muestra)
                    .frame(width: 14, height: 14)
                    .overlay(Circle().strokeBorder(.primary.opacity(0.2), lineWidth: 0.5))
                    .accessibilityHidden(true)
            }
            if let titulo {
                Text(titulo).foregroundStyle(.secondary)
            }
            Text(valor).foregroundStyle(.primary)
            if estimado {
                Image(systemName: "sparkles")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("estimado")
            }
            if let alQuitar {
                Button(action: alQuitar) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                        .padding(.leading, 2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Quitar \(valor)")
            }
        }
        .font(.subheadline)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.fill.tertiary, in: .capsule)
        .contentShape(.capsule)
        .accessibilityElement(children: alQuitar == nil ? .combine : .contain)
    }
}

#Preview {
    FlujoChips {
        Chip("azul oscuro", muestra: Color(hex: "#1B2A4A"))
        Chip("denim de algodón", titulo: "Material", estimado: true)
        Chip("Oversize", titulo: "Fit")
        Chip("remaches metálicos", alQuitar: {})
    }
    .padding()
}
