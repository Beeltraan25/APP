import DupeCompartir
import DupeDiseno
import Foundation
import UniformTypeIdentifiers

/// Lee los adjuntos de la hoja de compartir. Prioridad: página de Safari, foto, enlace y texto.
///
/// Las funciones son `nonisolated` a propósito: NSItemProvider llama a sus bloques desde un hilo
/// secundario y, si los bloques fueran del hilo principal, Swift pararía la extensión.
nonisolated enum LectorCompartido {
    static func leer(_ adjuntos: [NSItemProvider]) async -> EntradaCompartida? {
        if let proveedor = adjuntos.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) }),
           let pagina = await paginaSafari(proveedor) {
            return pagina
        }
        if let proveedor = adjuntos.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }),
           let datos = await datosImagen(proveedor),
           let jpeg = PreparadorFoto.jpeg(desde: datos) {
            return .foto(jpeg)
        }
        for proveedor in adjuntos where proveedor.canLoadObject(ofClass: URL.self) {
            if let url = await cargarURL(proveedor), url.scheme == "https" || url.scheme == "http" {
                return .enlace(url)
            }
        }
        for proveedor in adjuntos where proveedor.canLoadObject(ofClass: String.self) {
            if let texto = await cargarTexto(proveedor) {
                return .texto(texto)
            }
        }
        return nil
    }

    /// Resultado de Preprocesado.js: la URL y el HTML de la página tal como se ve en Safari.
    private static func paginaSafari(_ proveedor: NSItemProvider) async -> EntradaCompartida? {
        await withCheckedContinuation { continuacion in
            proveedor.loadItem(forTypeIdentifier: UTType.propertyList.identifier, options: nil) { item, _ in
                let resultado = (item as? NSDictionary)?[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any]
                guard let textoUrl = resultado?["url"] as? String,
                      let url = URL(string: textoUrl),
                      let html = resultado?["html"] as? String
                else {
                    continuacion.resume(returning: nil)
                    return
                }
                continuacion.resume(returning: .paginaSafari(url: url, html: html))
            }
        }
    }

    private static func datosImagen(_ proveedor: NSItemProvider) async -> Data? {
        await withCheckedContinuation { continuacion in
            _ = proveedor.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { datos, _ in
                continuacion.resume(returning: datos)
            }
        }
    }

    private static func cargarURL(_ proveedor: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuacion in
            _ = proveedor.loadObject(ofClass: URL.self) { url, _ in
                continuacion.resume(returning: url)
            }
        }
    }

    private static func cargarTexto(_ proveedor: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuacion in
            _ = proveedor.loadObject(ofClass: String.self) { texto, _ in
                continuacion.resume(returning: texto)
            }
        }
    }
}
