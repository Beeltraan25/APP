import DupeNucleo
import Foundation
import Observation

/// Lo que llega a la Share Extension, ya leído de los adjuntos.
public enum EntradaCompartida: Sendable, Hashable {
    /// Desde Safari: el HTML de la página ya cargada (con su JavaScript ejecutado).
    case paginaSafari(url: URL, html: String)
    case enlace(URL)
    /// Texto compartido (p. ej. "Mira esta sudadera https://…").
    case texto(String)
    /// Foto ya reducida a JPEG.
    case foto(Data)

    /// Qué se envía a analizar. Nil si no hay nada útil (p. ej. un texto sin enlace).
    public var entradaAnalisis: EntradaAnalisis? {
        switch self {
        case .paginaSafari(let url, let html):
            let pagina = ExtractorPagina.extraer(html: html, url: url)
            // Si la página de Safari no tiene datos de producto, se intenta leyendo el enlace.
            return pagina.esUtil ? .pagina(pagina) : .enlace(url)
        case .enlace(let url):
            return .enlace(url)
        case .texto(let texto):
            return ExtractorEnlace.primerEnlace(en: texto).map(EntradaAnalisis.enlace)
        case .foto(let datos):
            return .foto(datos)
        }
    }
}

/// Servicios de la extensión: el backend si está configurado; si no, datos de prueba.
public struct ServiciosCompartir: Sendable {
    public let analisis: any ServicioAnalisis
    public let busqueda: any ServicioBusqueda
    public let modoPrueba: Bool

    public init(analisis: any ServicioAnalisis, busqueda: any ServicioBusqueda, modoPrueba: Bool) {
        self.analisis = analisis
        self.busqueda = busqueda
        self.modoPrueba = modoPrueba
    }

    public static func crear(infoPlist: [String: Any]) -> ServiciosCompartir {
        guard let configuracion = ConfiguracionAPI.desde(infoPlist: infoPlist) else { return simulados() }
        let cliente = ClienteAPI(configuracion: configuracion, instalacionId: IdentificadorInstalacion.actual())
        return ServiciosCompartir(
            // En la extensión no hay navegador invisible: si la tienda bloquea la descarga, el backend
            // pedirá una captura. Desde Safari no hace falta: la página ya llega cargada.
            analisis: ServicioAnalisisRemoto(cliente: cliente, lector: LectorPaginasHTTP()),
            busqueda: ServicioBusquedaRemoto(cliente: cliente),
            modoPrueba: false
        )
    }

    public static func simulados(retraso: Duration = .milliseconds(600)) -> ServiciosCompartir {
        ServiciosCompartir(
            analisis: ServicioAnalisisSimulado(retraso: retraso),
            busqueda: ServicioBusquedaSimulado(retraso: retraso),
            modoPrueba: true
        )
    }
}

/// Analiza lo compartido y busca alternativas, sin pasos intermedios (la extensión debe ser rápida).
@MainActor
@Observable
public final class ModeloCompartir {
    public enum Fase: Sendable {
        case leyendo
        case analizando
        case buscando
        case listo(ficha: FichaPrenda, origen: ProductoOrigen?, alternativas: [Alternativa])
        case error(String)
    }

    public private(set) var fase: Fase = .leyendo

    /// Cuántas alternativas caben en la extensión.
    public static let maximoAlternativas = 8

    private let servicios: ServiciosCompartir

    public init(servicios: ServiciosCompartir) {
        self.servicios = servicios
    }

    public var modoPrueba: Bool { servicios.modoPrueba }

    public func procesar(_ entrada: EntradaCompartida?) async {
        guard let entrada, let analizar = entrada.entradaAnalisis else {
            fase = .error("No hemos encontrado ninguna prenda en lo que has compartido. Prueba con una foto o con el enlace de la prenda.")
            return
        }
        do {
            fase = .analizando
            let analisis = try await servicios.analisis.analizar(analizar)
            fase = .buscando
            let busqueda = try await servicios.busqueda.buscar(imagenUrl: analisis.imagenUrl, ficha: analisis.ficha)
            fase = .listo(
                ficha: analisis.ficha,
                origen: analisis.productoOrigen,
                alternativas: Array(busqueda.alternativas.prefix(Self.maximoAlternativas))
            )
        } catch let error as ErrorApp {
            fase = .error(error.mensaje)
        } catch {
            fase = .error(ErrorApp.desconocido.mensaje)
        }
    }
}
