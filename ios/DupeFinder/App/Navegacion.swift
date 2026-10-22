import DupeNucleo

/// Pantallas a las que se navega dentro de la pestaña Buscar.
enum Destino: Hashable {
    case resultados(PeticionResultados)
    case detalle(Alternativa)
}
