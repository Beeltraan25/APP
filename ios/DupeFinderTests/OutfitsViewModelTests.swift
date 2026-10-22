import DupeNucleo
import Foundation
import Testing
@testable import DupeFinder

@Suite("Outfits")
struct OutfitsViewModelTests {
    private func generado() async -> OutfitsViewModel {
        let vm = OutfitsViewModel(servicio: ServicioOutfitsSimulado(retraso: .zero))
        vm.estilo = "old money"
        await vm.generar(base: DatosSimulados.prendaBase)
        return vm
    }

    @Test("Sin estilo elegido no genera nada")
    func sinEstilo() async {
        let vm = OutfitsViewModel(servicio: ServicioOutfitsSimulado(retraso: .zero))
        await vm.generar(base: DatosSimulados.prendaBase)
        #expect(vm.outfits.isEmpty)
        if case .inactivo = vm.estado {} else { Issue.record("Debería seguir inactivo") }
    }

    @Test("Genera 3 outfits y muestra el progreso")
    func genera() async {
        let vm = await generado()
        #expect(vm.outfits.count == 3)
        // El último paso que anuncia el servicio simulado.
        #expect(vm.mensajeProgreso == "Buscando las piezas en las tiendas…")
        guard case .listo(let perfil) = vm.estado else {
            Issue.record("Se esperaba el perfil del estilo")
            return
        }
        #expect(perfil.estilo == "old money")
    }

    @Test("Cambiar una pieza actualiza el outfit y su precio total")
    func cambiarPieza() async throws {
        let vm = await generado()
        let outfit = try #require(vm.outfits.first)
        let pieza = try #require(outfit.piezas.first { !$0.esPrendaBase })
        let nuevo = DatosSimulados.busqueda.alternativas[0].producto
        let totalAntes = outfit.precioTotal.centimos

        vm.reemplazar(PiezaACambiar(outfitId: outfit.id, pieza: pieza), por: nuevo)

        let actualizado = try #require(vm.outfits.first)
        #expect(actualizado.piezas.first { $0.id == pieza.id }?.producto?.id == nuevo.id)
        let esperado = totalAntes - (pieza.producto?.precio?.centimos ?? 0) + nuevo.precio.centimos
        #expect(actualizado.precioTotal.centimos == esperado)
        #expect(vm.productosEn(outfit.id).contains(nuevo.id))
    }

    @Test("Al cambiar de prenda base se olvidan los outfits anteriores")
    func reiniciar() async {
        let vm = await generado()
        vm.reiniciar()
        #expect(vm.outfits.isEmpty)
    }
}
