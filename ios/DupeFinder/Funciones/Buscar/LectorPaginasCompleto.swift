import DupeNucleo
import Foundation
import UIKit
import WebKit

/// Lee un enlace en dos pasos:
/// 1. Descarga normal (rápida). Sirve para las tiendas que no bloquean.
/// 2. Si llega una verificación anti-bots (Zara, Mango…), abre la página en un navegador
///    invisible: ejecuta su JavaScript como Safari y, cuando aparecen los datos del producto,
///    lee el HTML.
nonisolated struct LectorPaginasCompleto: LectorPaginas {
    private let http = LectorPaginasHTTP()

    func leer(_ url: URL) async -> DatosPagina {
        let rapida = await http.leer(url)
        if rapida.esUtil { return rapida }

        guard let html = await NavegadorInvisible.html(de: url) else { return rapida }
        let pagina = ExtractorPagina.extraer(html: html, url: url)
        return pagina.esUtil ? pagina : rapida
    }
}

/// WKWebView fuera de la vista del usuario (transparente y sin interacción).
enum NavegadorInvisible {
    /// Devuelve el HTML en cuanto la página tiene datos de producto, o nil si no los tiene a tiempo.
    static func html(de url: URL, tiempoMaximo: Duration = .seconds(20)) async -> String? {
        let configuracion = WKWebViewConfiguration()
        configuracion.websiteDataStore = .default()
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuracion)
        web.alpha = 0
        web.isUserInteractionEnabled = false

        // Dentro de la ventana el navegador no se "duerme" y la verificación de la tienda avanza.
        let ventana = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        ventana?.addSubview(web)
        defer { web.removeFromSuperview() }

        web.load(URLRequest(url: url))
        let limite = ContinuousClock.now.advanced(by: tiempoMaximo)
        while ContinuousClock.now < limite {
            try? await Task.sleep(for: .seconds(1))
            if let html = try? await web.evaluateJavaScript(scriptProducto) as? String, !html.isEmpty {
                return html
            }
        }
        return nil
    }

    /// Devuelve el HTML solo cuando ya hay JSON-LD o imagen og (las verificaciones no los tienen).
    private static let scriptProducto = """
        (function () {
          var listo = document.querySelector('script[type="application/ld+json"], meta[property="og:image"]');
          return listo ? document.documentElement.outerHTML : "";
        })();
        """
}
