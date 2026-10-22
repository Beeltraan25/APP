import DupeNucleo
import SwiftUI

/// Etiqueta corta de una alternativa: ✓ lo que coincide ("Mismo color"), ⇄ lo que cambia ("Tejido más ligero").
public struct EtiquetaSimilitud: View {
    private let etiqueta: Etiqueta
    private let compacta: Bool

    public init(_ etiqueta: Etiqueta, compacta: Bool = false) {
        self.etiqueta = etiqueta
        self.compacta = compacta
    }

    private var coincide: Bool { etiqueta.tipo == .coincide }

    public var body: some View {
        HStack(spacing: 3) {
            Image(systemName: coincide ? "checkmark" : "arrow.left.arrow.right")
                .font(.system(size: compacta ? 8 : 10, weight: .bold))
                .foregroundStyle(coincide ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
            Text(etiqueta.texto)
                .foregroundStyle(coincide ? .primary : .secondary)
        }
        .font(compacta ? .caption2 : .footnote)
        .padding(.horizontal, compacta ? 6 : 10)
        .padding(.vertical, compacta ? 3 : 6)
        .background(.fill.tertiary, in: .capsule)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiqueta.texto)
    }
}
