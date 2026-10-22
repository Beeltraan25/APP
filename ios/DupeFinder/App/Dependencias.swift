import DupeNucleo
import Foundation
import Observation

/// Servicios de la app. Las vistas los reciben por el entorno, así se pueden cambiar
/// por versiones simuladas en previews, tests y capturas.
@Observable
final class Dependencias {
    let analisis: any ServicioAnalisis
    /// true si la app usa datos de prueba porque no hay servidor configurado.
    let modoPrueba: Bool

    init(analisis: any ServicioAnalisis, modoPrueba: Bool) {
        self.analisis = analisis
        self.modoPrueba = modoPrueba
    }

    /// Usa el backend si Secretos.xcconfig define URL_BACKEND y CLAVE_APP; si no, datos de prueba.
    static func crear(infoPlist: [String: Any] = Bundle.main.infoDictionary ?? [:]) -> Dependencias {
        guard ModoCaptura.actual == nil, let configuracion = ConfiguracionAPI.desde(infoPlist: infoPlist) else {
            return simuladas()
        }
        let cliente = ClienteAPI(configuracion: configuracion, instalacionId: IdentificadorInstalacion.actual())
        return Dependencias(
            analisis: ServicioAnalisisRemoto(cliente: cliente, lector: LectorPaginasCompleto()),
            modoPrueba: false
        )
    }

    static func simuladas() -> Dependencias {
        // En las capturas automáticas no hay que esperar.
        Dependencias(
            analisis: ServicioAnalisisSimulado(retraso: ModoCaptura.actual == nil ? .milliseconds(1200) : .zero),
            modoPrueba: true
        )
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
