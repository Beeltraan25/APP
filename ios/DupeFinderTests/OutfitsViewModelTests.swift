import DupeNucleo
import Foundation
import Testing
@testable import DupeFinder

/// Guarda los mensajes de progreso que llegan durante la generación.
actor Mensajes {
    private(set) var lista: [String] = []
    func anadir(_ mensaje: String) { lista.append(mensaje) }
}

/// Servicio de outfits que anota el progreso y devuelve los datos de prueba.
nonisolated struct OutfitsConProgreso: ServicioOutfits {
    let mensajes: Mensajes

    func generar(
        base: PrendaBase,
        estilo: String,
        presupuesto: PresupuestoPorPrenda,
        progreso: @escaping @Sendable (String) async -> Void
    ) async throws -> RespuestaOutfits {
        await progreso("Analizando el estilo…")
        await mensajes.anadir("Analizando el estilo…")
        return DatosSimulados.outfits
    }

    func cambiarPieza(consulta: String, presupuesto: PresupuestoPorPrenda, excluir: [String]) async throws -> [Producto] {
        []
    }
}

@Suite("Outfits")
struct OutfitsViewModelTests {
    @Test("Sin estilo elegido no genera nada")
    func sinEstilo() async {
        let vm = OutfitsViewModel(servicio: ServicioOutfitsSimulado(retraso: .zero))
        await vm.generar(base: DatosSimulados.prendaBase)
        #expect(vm.outfits.isEmpty)
        if case .inactivo = vm.estado {} else { Issue.record("Debería seguir inactivo") }
    }

    @Test("Genera 3 outfits y muestra el progreso")
    func genera() async {
        let mensajes = Mensajes()
        let vm = OutfitsViewModel(servicio: OutfitsConProgreso(mensajes: mensajes))
        vm.estilo = "old money"
        await vm.generar(base: DatosSimulados.prendaBase)
        #expect(vm.outfits.count == 3)
        #expect(vm.mensajeProgreso == "Analizando el estilo…")
        #expect(await mensajes.lista == ["Analizando el estilo…"])
        guard case .listo(let perfil) = vm.estado else {
            Issue.record("Se esperaba el perfil del estilo")
            return
        }
        #expect(perfil.estilo == "old money")
    }

    @Test("Cambiar una pieza actualiza el outfit y su precio total")
    func cambiarPieza() async throws {
        let vm = OutfitsViewModel(servicio: ServicioOutfitsSimulado(retraso: .zero))
        vm.estilo = "old money"
        await vm.generar(base: DatosSimulados.prendaBase)
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
        let vm = OutfitsViewModel(servicio: ServicioOutfitsSimulado(retraso: .zero))
        vm.estilo = "old money"
        await vm.generar(base: DatosSimulados.prendaBase)
        vm.reiniciar()
        #expect(vm.outfits.isEmpty)
    }
}
