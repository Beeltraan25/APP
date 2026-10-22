import DupeNucleo
import Foundation
import Observation

/// Un dato de texto de la ficha que el usuario puede corregir tocando su chip.
struct CampoEditable: Identifiable, Hashable {
    /// Nombre del campo en la API (el mismo que usa `camposEstimados`).
    let id: String
    let titulo: String
    let ruta: WritableKeyPath<FichaPrenda, String?>
    /// Si se puede dejar vacío (p. ej. "cuello" en unos pantalones).
    let permiteVacio: Bool

    static let categoria = CampoEditable(id: "categoria", titulo: "Prenda", ruta: \.categoriaEditable, permiteVacio: false)
    static let subcategoria = CampoEditable(id: "subcategoria", titulo: "Tipo", ruta: \.subcategoria, permiteVacio: true)
    static let color = CampoEditable(id: "color_principal", titulo: "Color", ruta: \.nombreColorEditable, permiteVacio: false)
    static let estampado = CampoEditable(id: "estampado", titulo: "Estampado", ruta: \.estampadoEditable, permiteVacio: false)
    static let material = CampoEditable(id: "material", titulo: "Material", ruta: \.material, permiteVacio: true)
    static let largo = CampoEditable(id: "largo", titulo: "Largo", ruta: \.largo, permiteVacio: true)
    static let cuello = CampoEditable(id: "cuello", titulo: "Cuello", ruta: \.cuello, permiteVacio: true)
    static let mangas = CampoEditable(id: "mangas", titulo: "Mangas", ruta: \.mangas, permiteVacio: true)
    static let cierres = CampoEditable(id: "cierres", titulo: "Cierres", ruta: \.cierres, permiteVacio: true)
    static let acabado = CampoEditable(id: "acabado", titulo: "Acabado", ruta: \.acabado, permiteVacio: true)
}

/// Listas de la ficha a las que se pueden añadir o quitar elementos.
enum ListaFicha: String, Identifiable {
    case detalles, palabrasClave

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .detalles: "Añadir detalle"
        case .palabrasClave: "Añadir búsqueda"
        }
    }
}

@Observable
final class FichaViewModel {
    var ficha: FichaPrenda
    let respuesta: RespuestaAnalisis
    let foto: Data?

    init(analisis: AnalisisPresentado) {
        respuesta = analisis.respuesta
        ficha = analisis.respuesta.ficha
        foto = analisis.foto
    }

    var hayEstimados: Bool { !ficha.camposEstimados.isEmpty }

    func esEstimado(_ campo: String) -> Bool {
        ficha.camposEstimados.contains(campo)
    }

    func actualizar(_ campo: CampoEditable, a valor: String) {
        let limpio = valor.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty || campo.permiteVacio else { return }
        ficha[keyPath: campo.ruta] = limpio.isEmpty ? nil : limpio
        confirmar(campo.id)
    }

    func cambiarFit(_ fit: Fit) {
        ficha.fit = fit
        confirmar("fit")
    }

    func cambiarGramaje(_ gramaje: GramajeEstimado) {
        ficha.gramajeEstimado = gramaje
        // El gramaje exacto ya no encaja con lo que ha elegido el usuario.
        ficha.gramajeGsm = nil
        confirmar("gramaje_estimado")
        confirmar("gramaje_gsm")
    }

    func quitar(_ texto: String, de lista: ListaFicha) {
        switch lista {
        case .detalles:
            ficha.detalles.removeAll { $0 == texto }
            confirmar("detalles")
        case .palabrasClave:
            ficha.palabrasClaveBusqueda.removeAll { $0 == texto }
        }
    }

    func anadir(_ texto: String, a lista: ListaFicha) {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return }
        switch lista {
        case .detalles:
            guard !ficha.detalles.contains(limpio) else { return }
            ficha.detalles.append(limpio)
            confirmar("detalles")
        case .palabrasClave:
            guard !ficha.palabrasClaveBusqueda.contains(limpio) else { return }
            ficha.palabrasClaveBusqueda.append(limpio)
        }
    }

    /// Lo que ha corregido el usuario deja de ser una estimación de la IA.
    private func confirmar(_ campo: String) {
        ficha.camposEstimados.removeAll { $0 == campo }
    }
}

// Accesos opcionales a campos que nunca están vacíos, para poder editarlos todos igual.
extension FichaPrenda {
    var categoriaEditable: String? {
        get { categoria }
        set { if let newValue { categoria = newValue } }
    }

    var nombreColorEditable: String? {
        get { colorPrincipal.nombre }
        set { if let newValue { colorPrincipal.nombre = newValue } }
    }

    var estampadoEditable: String? {
        get { estampado }
        set { if let newValue { estampado = newValue } }
    }
}
