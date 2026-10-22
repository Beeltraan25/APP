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
        #expect(vm.visibles.count == 17)
        #expect(vm.conteo(nil) == 17)
    }

    @Test("Filtra por rango sin volver a buscar")
    func filtraPorRango() async {
        let vm = await cargado()
        vm.rango = .economico
        #expect(vm.visibles.allSatisfy { $0.producto.rango == .economico })
        #expect(vm.visibles.count == vm.conteo(.economico))
        #expect(vm.conteo(.premium) == 0)
        vm.rango = nil
        #expect(vm.visibles.count == 17)
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
