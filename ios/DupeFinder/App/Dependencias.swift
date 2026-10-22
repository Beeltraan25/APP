import DupeNucleo
import Foundation
import Observation

/// Servicios de la app. Las vistas los reciben por el entorno, así se pueden cambiar
/// por versiones simuladas en previews, tests y capturas.
@Observable
final class Dependencias {
    let analisis: any ServicioAnalisis

    init(analisis: any ServicioAnalisis) {
        self.analisis = analisis
    }

    static func simuladas() -> Dependencias {
        // En las capturas automáticas no hay que esperar.
        Dependencias(analisis: ServicioAnalisisSimulado(retraso: ModoCaptura.actual == nil ? .milliseconds(1200) : .zero))
    }
}

/// Pantalla que se abre al lanzar la app con `-captura <pantalla>`.
/// Lo usa la integración continua para hacer capturas sin Mac.
enum ModoCaptura: String {
    case inicio, menu, ficha, outfits, guardados

    static var actual: ModoCaptura? {
        UserDefaults.standard.string(forKey: "captura").flatMap(ModoCaptura.init(rawValue:))
    }
}
