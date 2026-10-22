import SwiftData
import SwiftUI

@main
struct DupeFinderApp: App {
    /// Backend real si está configurado (Secretos.xcconfig); si no, datos de prueba.
    @State private var dependencias = Dependencias.crear()
    @State private var estado = EstadoCompartido()
    private let almacen = Almacen.crear()

    var body: some Scene {
        WindowGroup {
            PestanasRaiz()
                .environment(dependencias)
                .environment(estado)
        }
        .modelContainer(almacen)
    }
}
