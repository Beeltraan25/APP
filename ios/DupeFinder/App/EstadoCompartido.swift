import DupeNucleo
import Foundation
import Observation

/// Lo que comparten las pestañas: cuál está abierta y la prenda con la que crear outfits.
@Observable
final class EstadoCompartido {
    var pestana: Pestana
    /// La última prenda analizada, o la alternativa que el usuario ha elegido para sus outfits.
    var prendaBase: PrendaBase?

    init() {
        switch ModoCaptura.actual {
        case .outfits:
            pestana = .outfits
            prendaBase = DatosSimulados.prendaBase
        case .guardados, .outfitGuardado:
            pestana = .guardados
        default:
            pestana = .buscar
        }
    }

    /// "Crear outfits con esta prenda": la elige y abre la pestaña Outfits.
    func crearOutfits(con base: PrendaBase) {
        prendaBase = base
        pestana = .outfits
    }
}
