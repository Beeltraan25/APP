import DupeNucleo
import Foundation
import Observation

/// La pieza que el usuario quiere cambiar (mantener pulsado → "Cambiar esta prenda").
struct PiezaACambiar: Identifiable {
    let outfitId: Outfit.ID
    let pieza: PiezaOutfit
    var id: String { "\(outfitId)-\(pieza.id)" }
}

@Observable
final class OutfitsViewModel {
    /// nil hasta que el usuario elige un estilo.
    var estilo: String?
    var presupuesto: PresupuestoPorPrenda = .hasta60
    private(set) var estado: EstadoCarga<PerfilEstilo> = .inactivo
    /// Se pueden cambiar piezas, así que se guardan aparte del estado.
    private(set) var outfits: [Outfit] = []
    private(set) var mensajeProgreso: String?

    let servicio: any ServicioOutfits

    init(servicio: any ServicioOutfits) {
        self.servicio = servicio
        if ModoCaptura.actual == .outfits { estilo = "old money" }
    }

    var generando: Bool { estado.estaCargando }

    func generar(base: PrendaBase) async {
        guard let estilo, !generando else { return }
        estado = .cargando
        mensajeProgreso = nil
        outfits = []
        do {
            let respuesta = try await servicio.generar(base: base, estilo: estilo, presupuesto: presupuesto) { [weak self] mensaje in
                await self?.mostrarProgreso(mensaje)
            }
            outfits = respuesta.outfits
            estado = .listo(respuesta.perfilEstilo)
        } catch let error as ErrorApp {
            estado = .error(error)
        } catch {
            estado = .error(.desconocido)
        }
    }

    func mostrarProgreso(_ mensaje: String) {
        mensajeProgreso = mensaje
    }

    /// Al cambiar de prenda base, los outfits anteriores ya no sirven.
    func reiniciar() {
        guard !generando else { return }
        estado = .inactivo
        outfits = []
    }

    func reemplazar(_ cambio: PiezaACambiar, por producto: Producto) {
        guard let indice = outfits.firstIndex(where: { $0.id == cambio.outfitId }) else { return }
        outfits[indice].reemplazar(pieza: cambio.pieza.id, por: producto)
    }

    /// Productos que ya están en el outfit: no se vuelven a proponer.
    func productosEn(_ outfitId: Outfit.ID) -> [String] {
        outfits.first { $0.id == outfitId }?.piezas.compactMap { $0.producto?.id } ?? []
    }
}
