import SwiftUI

/// Texto e icono de una opción grande (Cámara, Fotos, Pegar enlace).
/// El vidrio se aplica fuera, en el botón que la contiene.
public struct EtiquetaOpcion: View {
    private let titulo: String
    private let simbolo: String

    public init(_ titulo: String, simbolo: String) {
        self.titulo = titulo
        self.simbolo = simbolo
    }

    public var body: some View {
        Label(titulo, systemImage: simbolo)
            .font(.headline)
            .frame(minWidth: 220)
            .padding(.horizontal, Espacio.l)
            .padding(.vertical, 16)
            .contentShape(.capsule)
    }
}
