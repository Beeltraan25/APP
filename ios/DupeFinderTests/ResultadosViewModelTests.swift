import DupeNucleo
import Foundation
import Testing
@testable import DupeFinder

/// Servicio de búsqueda que siempre falla.
nonisolated struct BusquedaQueFalla: ServicioBusqueda {
    func buscar(imagenUrl: URL?, ficha: FichaPrenda) async throws -> RespuestaBusqueda {
        throw ErrorApp.sinConexion
    }
}

@Suite("Resultados")
struct ResultadosViewModelTests {
    private func cargado() async -> ResultadosViewModel {
        let vm = ResultadosViewModel(peticion: .ejemplo, servicio: ServicioBusquedaSimulado(retraso: .zero))
        await vm.cargar()
        return vm
    }

    @Test("Carga todas las alternativas")
    func cargaTodo() async {
        let vm = await cargado()
        #expect(vm.visibles.count == 16)
        #expect(vm.conteo(nil) == 16)
    }

    @Test("Filtra por rango sin volver a buscar")
    func filtraPorRango() async {
        let vm = await cargado()
        vm.rango = .economico
        #expect(vm.visibles.allSatisfy { $0.producto.rango == .economico })
        #expect(vm.visibles.count == vm.conteo(.economico))
        #expect(vm.conteo(.premium) == 0)
        vm.rango = nil
        #expect(vm.visibles.count == 16)
    }

    @Test("Separa las de tu color de las de otros colores")
    func porColor() async {
        let vm = await cargado()
        #expect(vm.deTuColor.count == 11)
        #expect(vm.deOtrosColores.count == 5)
        #expect(vm.deOtrosColores.allSatisfy { $0.mismoColor == false })
    }

    @Test("Las ideas de Pinterest se piden aparte")
    func inspiracion() async {
        let vm = await cargado()
        guard case .inactivo = vm.inspiracion else {
            Issue.record("No debería pedirlas sin que el usuario quiera")
            return
        }
        await vm.cargarInspiracion()
        #expect(vm.inspiracion.valor?.ideas.isEmpty == false)
        #expect(vm.inspiracion.valor?.rollo.isEmpty == false)
    }

    @Test("Si la búsqueda falla, guarda el error para mostrarlo")
    func error() async {
        let vm = ResultadosViewModel(peticion: .ejemplo, servicio: BusquedaQueFalla())
        await vm.cargar()
        guard case .error(let error) = vm.estado else {
            Issue.record("Se esperaba un error")
            return
        }
        #expect(error == .sinConexion)
        #expect(vm.visibles.isEmpty)
    }
}
