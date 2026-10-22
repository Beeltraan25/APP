import SwiftData
import SwiftUI

@main
struct DupeFinderApp: App {
    /// Fase 1: todo con datos de prueba. En la fase 2 se conectará el backend.
    @State private var dependencias = Dependencias.simuladas()

    var body: some Scene {
        WindowGroup {
            PestanasRaiz()
                .environment(dependencias)
        }
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self])
    }
}
