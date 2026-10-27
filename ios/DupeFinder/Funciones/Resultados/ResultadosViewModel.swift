import DupeNucleo
import Foundation
import Observation

/// Lo que hace falta para buscar: la ficha revisada y la imagen para Google Lens.
struct PeticionResultados: Hashable {
    let ficha: FichaPrenda
    let imagenUrl: URL?
    /// Lo que cuesta la prenda: solo se buscan alternativas más baratas.
    var precioOriginal: Precio? = nil

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
    /// Ideas de Pinterest: solo se piden si el usuario quiere (gastan ~4 búsquedas de SerpAPI).
    private(set) var inspiracion: EstadoCarga<RespuestaInspiracion> = .inactivo

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

    /// Primero las del color de la prenda; nil (no se sabe) cuenta como del mismo color.
    var deTuColor: [Alternativa] { visibles.filter { $0.mismoColor != false } }
    var deOtrosColores: [Alternativa] { visibles.filter { $0.mismoColor == false } }

    func conteo(_ rango: RangoPrecio?) -> Int {
        let todas = estado.valor?.alternativas ?? []
        guard let rango else { return todas.count }
        return todas.filter { $0.producto.rango == rango }.count
    }

    /// Más prendas del mismo rollo, sin repetir las que ya se muestran.
    func cargarInspiracion() async {
        if case .cargando = inspiracion { return }
        inspiracion = .cargando
        let yaMostradas = (estado.valor?.alternativas ?? []).map(\.producto.id)
        do {
            inspiracion = .listo(try await servicio.inspiracion(
                ficha: peticion.ficha,
                imagenUrl: peticion.imagenUrl,
                precioOriginal: peticion.precioOriginal?.centimos,
                excluir: yaMostradas
            ))
        } catch let error as ErrorApp {
            inspiracion = .error(error)
        } catch {
            inspiracion = .error(.desconocido)
        }
    }

    func cargar() async {
        if case .cargando = estado { return }
        inspiracion = .inactivo
        estado = .cargando
        do {
            estado = .listo(try await servicio.buscar(imagenUrl: peticion.imagenUrl, ficha: peticion.ficha, precioOriginal: peticion.precioOriginal?.centimos))
        } catch let error as ErrorApp {
            estado = .error(error)
        } catch {
            estado = .error(.desconocido)
        }
    }
}
