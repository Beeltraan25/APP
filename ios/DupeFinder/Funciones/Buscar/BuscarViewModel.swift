import DupeDiseno
import DupeNucleo
import Foundation
import Observation

/// Un análisis listo para mostrarse en la hoja de la ficha.
struct AnalisisPresentado: Identifiable {
    let id = UUID()
    let respuesta: RespuestaAnalisis
    /// La foto que hizo o eligió el usuario (para la miniatura). Nil si era un enlace.
    let foto: Data?
    /// Viene del historial (no es un análisis nuevo).
    var reabierto = false
}

@Observable
final class BuscarViewModel {
    private(set) var analizando = false
    /// Al tener valor se abre la hoja con la ficha.
    var analisis: AnalisisPresentado?
    /// Al tener valor se muestra un aviso con el error.
    var mensajeError: String?

    private let servicio: any ServicioAnalisis

    init(servicio: any ServicioAnalisis) {
        self.servicio = servicio
    }

    func analizarFoto(_ datos: Data) async {
        guard let jpeg = PreparadorFoto.jpeg(desde: datos) else {
            mensajeError = "No hemos podido leer esa foto. Prueba con otra."
            return
        }
        await analizar(.foto(jpeg), foto: jpeg)
    }

    func analizarEnlace(texto: String) async {
        guard let url = ExtractorEnlace.primerEnlace(en: texto) else {
            mensajeError = "Eso no parece un enlace. Copia la dirección de la prenda y vuelve a intentarlo."
            return
        }
        await analizar(.enlace(url))
    }

    func analizar(_ entrada: EntradaAnalisis, foto: Data? = nil) async {
        guard !analizando else { return }
        analizando = true
        defer { analizando = false }

        do {
            let respuesta = try await servicio.analizar(entrada)
            analisis = AnalisisPresentado(respuesta: respuesta, foto: foto)
        } catch let error as ErrorApp {
            mensajeError = error.mensaje
        } catch {
            mensajeError = ErrorApp.desconocido.mensaje
        }
    }
}
