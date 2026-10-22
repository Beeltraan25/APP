import DupeNucleo
import Testing
@testable import DupeFinder

@Suite("Dependencias")
struct DependenciasTests {
    @Test("Sin servidor configurado, la app usa datos de prueba")
    func sinServidor() {
        let dependencias = Dependencias.crear(infoPlist: ["URL_BACKEND": "", "CLAVE_APP": ""])
        #expect(dependencias.modoPrueba)
        #expect(dependencias.analisis is ServicioAnalisisSimulado)
    }

    @Test("Con servidor configurado, la app usa el backend")
    func conServidor() {
        let dependencias = Dependencias.crear(infoPlist: ["URL_BACKEND": "http://127.0.0.1:8787", "CLAVE_APP": "secreta"])
        #expect(!dependencias.modoPrueba)
        #expect(dependencias.analisis is ServicioAnalisisRemoto)
    }
}
