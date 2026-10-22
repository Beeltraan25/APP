import DupeCompartir
import Foundation
import SwiftUI

/// Solo para las capturas automáticas: la Share Extension tal como se ve al compartir una foto.
/// (El simulador no puede abrir la hoja de compartir desde un script.)
struct CapturaCompartir: View {
    @State private var modelo = ModeloCompartir(servicios: .simulados(retraso: .zero))

    var body: some View {
        VistaCompartir(modelo: modelo) {}
            // Los datos de prueba de la foto (unos vaqueros) encajan con las alternativas de prueba.
            .task { await modelo.procesar(.foto(Data())) }
    }
}
