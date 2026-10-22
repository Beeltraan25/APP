import SwiftUI

/// Coloca los chips uno tras otro y salta de línea cuando no caben (como el texto).
public struct FlujoChips: Layout {
    private let espacio: CGFloat

    public init(espacio: CGFloat = 8) {
        self.espacio = espacio
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let filas = repartir(subviews, anchoMaximo: proposal.width ?? .infinity)
        let alto = filas.map(\.alto).reduce(0, +) + espacio * CGFloat(max(filas.count - 1, 0))
        let ancho = filas.map(\.ancho).max() ?? 0
        return CGSize(width: proposal.width ?? ancho, height: alto)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for fila in repartir(subviews, anchoMaximo: bounds.width) {
            var x = bounds.minX
            for elemento in fila.elementos {
                subviews[elemento.indice].place(
                    at: CGPoint(x: x, y: y),
                    proposal: ProposedViewSize(elemento.tamano)
                )
                x += elemento.tamano.width + espacio
            }
            y += fila.alto + espacio
        }
    }

    private struct Elemento {
        let indice: Int
        let tamano: CGSize
    }

    private struct Fila {
        var elementos: [Elemento] = []
        var ancho: CGFloat = 0
        var alto: CGFloat = 0
    }

    private func repartir(_ subviews: Subviews, anchoMaximo: CGFloat) -> [Fila] {
        var filas: [Fila] = []
        var actual = Fila()
        for (indice, subview) in subviews.enumerated() {
            var tamano = subview.sizeThatFits(.unspecified)
            tamano.width = min(tamano.width, anchoMaximo)
            let anchoConEste = actual.elementos.isEmpty ? tamano.width : actual.ancho + espacio + tamano.width
            if !actual.elementos.isEmpty && anchoConEste > anchoMaximo {
                filas.append(actual)
                actual = Fila()
            }
            actual.ancho = actual.elementos.isEmpty ? tamano.width : actual.ancho + espacio + tamano.width
            actual.alto = max(actual.alto, tamano.height)
            actual.elementos.append(Elemento(indice: indice, tamano: tamano))
        }
        if !actual.elementos.isEmpty { filas.append(actual) }
        return filas
    }
}
