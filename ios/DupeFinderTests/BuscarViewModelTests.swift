import DupeDiseno
import DupeNucleo
import Foundation
import Testing
import UIKit
@testable import DupeFinder

/// Servicio que siempre falla, para comprobar los mensajes de error.
nonisolated struct ServicioQueFalla: ServicioAnalisis {
    let error: ErrorApp

    func analizar(_ entrada: EntradaAnalisis) async throws -> RespuestaAnalisis {
        throw error
    }
}

@Suite("Buscar")
struct BuscarViewModelTests {
    @Test("Una foto abre la ficha")
    func fotoAbreLaFicha() async {
        let vm = BuscarViewModel(servicio: ServicioAnalisisSimulado(retraso: .zero))
        await vm.analizar(.foto(Data()))
        #expect(vm.analisis?.respuesta.ficha.categoria == "vaqueros")
        #expect(vm.mensajeError == nil)
        #expect(!vm.analizando)
    }

    @Test("Un enlace dentro de un texto también funciona")
    func enlaceDentroDeTexto() async {
        let vm = BuscarViewModel(servicio: ServicioAnalisisSimulado(retraso: .zero))
        await vm.analizarEnlace(texto: "Mira esta https://www.zara.com/es/es/x.html")
        #expect(vm.analisis?.respuesta.productoOrigen?.tienda.nombre == "Zara")
    }

    @Test("Un texto sin enlace muestra un aviso amable")
    func textoSinEnlace() async {
        let vm = BuscarViewModel(servicio: ServicioAnalisisSimulado(retraso: .zero))
        await vm.analizarEnlace(texto: "hola")
        #expect(vm.analisis == nil)
        #expect(vm.mensajeError?.contains("enlace") == true)
    }

    @Test("Los errores del servidor se muestran con su mensaje")
    func errorDelServidor() async {
        let error = ErrorApp.servidor(ErrorAPI(codigo: "SOLO_HOMBRE", mensaje: "Por ahora Dupe Finder solo busca ropa de hombre."))
        let vm = BuscarViewModel(servicio: ServicioQueFalla(error: error))
        await vm.analizar(.foto(Data()))
        #expect(vm.analisis == nil)
        #expect(vm.mensajeError == "Por ahora Dupe Finder solo busca ropa de hombre.")
    }
}

@Suite("Ficha")
struct FichaViewModelTests {
    private func crear() -> FichaViewModel {
        FichaViewModel(analisis: AnalisisPresentado(respuesta: DatosSimulados.analisisFoto, foto: nil))
    }

    @Test("Corregir un dato deja de marcarlo como estimado")
    func corregirMaterial() {
        let vm = crear()
        #expect(vm.esEstimado("material"))
        vm.actualizar(.material, a: "  algodón orgánico ")
        #expect(vm.ficha.material == "algodón orgánico")
        #expect(!vm.esEstimado("material"))
    }

    @Test("La prenda no se puede dejar vacía")
    func categoriaVacia() {
        let vm = crear()
        vm.actualizar(.categoria, a: "   ")
        #expect(vm.ficha.categoria == "vaqueros")
    }

    @Test("Elegir el gramaje borra los g/m² estimados")
    func cambiarGramaje() {
        let vm = crear()
        vm.cambiarGramaje(.medio)
        #expect(vm.ficha.gramajeEstimado == .medio)
        #expect(vm.ficha.gramajeGsm == nil)
        #expect(!vm.esEstimado("gramaje_estimado"))
    }

    @Test("Añadir y quitar detalles")
    func detalles() {
        let vm = crear()
        vm.anadir("cintura elástica", a: .detalles)
        vm.anadir("cintura elástica", a: .detalles)
        #expect(vm.ficha.detalles.filter { $0 == "cintura elástica" }.count == 1)
        vm.quitar("remaches metálicos", de: .detalles)
        #expect(!vm.ficha.detalles.contains("remaches metálicos"))
    }
}

@Suite("Fotos")
struct PreparadorFotoTests {
    @Test("Reduce las fotos grandes a 1024 px como máximo")
    func reduceFotos() throws {
        let grande = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000)).image { contexto in
            UIColor.gray.setFill()
            contexto.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000))
        }
        let datos = try #require(grande.pngData())
        let jpeg = try #require(PreparadorFoto.jpeg(desde: datos))
        let reducida = try #require(UIImage(data: jpeg))
        #expect(max(reducida.size.width, reducida.size.height) <= 1024)
    }

    @Test("Rechaza datos que no son una imagen")
    func rechazaBasura() {
        #expect(PreparadorFoto.jpeg(desde: Data("hola".utf8)) == nil)
    }
}
