import SwiftData
import SwiftUI

@main
struct DupeFinderApp: App {
    /// Backend real si está configurado (Secretos.xcconfig); si no, datos de prueba.
    @State private var dependencias = Dependencias.crear()
    private let almacen = Almacen.crear()

    var body: some Scene {
        WindowGroup {
            PestanasRaiz()
                .environment(dependencias)
        }
        .modelContainer(almacen)
    }
}
