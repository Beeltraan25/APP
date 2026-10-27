import DupeNucleo
import Foundation
import Testing
@testable import DupeFinder

@Suite("Precio de la ficha")
struct PrecioFichaTests {
    @Test("Si la tienda dice el precio, viene puesto")
    func precioDeLaTienda() {
        let vm = FichaViewModel(analisis: AnalisisPresentado(respuesta: DatosSimulados.analisisEnlace, foto: nil))
        #expect(vm.precio?.centimos == 2995)
    }

    @Test("Se puede escribir a mano, con coma o con punto, y quitar")
    func escribirPrecio() {
        let vm = FichaViewModel(analisis: AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: nil))
        vm.cambiarPrecio("59,95")
        #expect(vm.precio?.centimos == 5995)
        vm.cambiarPrecio("60 €")
        #expect(vm.precio?.centimos == 6000)
        vm.cambiarPrecio("12.5")
        #expect(vm.precio?.centimos == 1250)
        // Algo que no es un precio no cambia nada.
        vm.cambiarPrecio("abc")
        #expect(vm.precio?.centimos == 1250)
        vm.cambiarPrecio("")
        #expect(vm.precio == nil)
    }

    @Test("La búsqueda lleva el precio")
    func peticionConPrecio() {
        let peticion = PeticionResultados(ficha: DatosSimulados.analisisFoto.ficha, imagenUrl: nil, precioOriginal: Precio(centimos: 5995))
        #expect(peticion.precioOriginal?.centimos == 5995)
    }
}
