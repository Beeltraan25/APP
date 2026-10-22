import DupeCompartir
import Foundation
import SwiftUI

/// Solo para las capturas automáticas: la Share Extension tal como se ve al compartir un enlace.
/// (El simulador no puede abrir la hoja de compartir desde un script.)
struct CapturaCompartir: View {
    @State private var modelo = ModeloCompartir(servicios: .simulados(retraso: .zero))

    var body: some View {
        VistaCompartir(modelo: modelo) {}
            .task {
                if let url = URL(string: "https://www.zara.com/es/es/sudadera-p01234.html") {
                    await modelo.procesar(.enlace(url))
                }
            }
    }
}
