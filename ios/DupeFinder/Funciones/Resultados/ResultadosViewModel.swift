import DupeNucleo
import Foundation
import Observation

/// Lo que hace falta para buscar: la ficha revisada y la imagen para Google Lens.
struct PeticionResultados: Hashable {
    let ficha: FichaPrenda
    let imagenUrl: URL?

    /// Para previews y capturas.
    static var ejemplo: PeticionResultados {
        let analisis = DatosSimulados.analisisFoto
        return PeticionResultados(ficha: analisis.ficha, imagenUrl: analisis.imagenUrl)
    }
}

@Observable
final class ResultadosViewModel {
    let peticion: PeticionResultados
    private(set) var estado: EstadoCarga<RespuestaBusqueda> = .inactivo
    /// nil = todos los rangos. Cambiar de rango no hace otra búsqueda: el backend los devuelve todos.
    var rango: RangoPrecio?

    private let servicio: any ServicioBusqueda

    init(peticion: PeticionResultados, servicio: any ServicioBusqueda) {
        self.peticion = peticion
        self.servicio = servicio
    }

    var visibles: [Alternativa] {
        let todas = estado.valor?.alternativas ?? []
        guard let rango else { return todas }
        return todas.filter { $0.producto.rango == rango }
    }

    func conteo(_ rango: RangoPrecio?) -> Int {
        let todas = estado.valor?.alternativas ?? []
        guard let rango else { return todas.count }
        return todas.filter { $0.producto.rango == rango }.count
    }

    func cargar() async {
        if case .cargando = estado { return }
        estado = .cargando
        do {
            estado = .listo(try await servicio.buscar(imagenUrl: peticion.imagenUrl, ficha: peticion.ficha))
        } catch let error as ErrorApp {
            estado = .error(error)
        } catch {
            estado = .error(.desconocido)
        }
    }
}
