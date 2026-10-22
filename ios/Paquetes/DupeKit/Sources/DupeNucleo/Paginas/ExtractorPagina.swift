import Foundation

/// Lee de un HTML los datos de un producto: JSON-LD (schema.org Product) y etiquetas og:/product:.
/// Es el mismo análisis tanto si el HTML llega por una descarga normal como desde el navegador invisible.
public enum ExtractorPagina {
    public static func extraer(html: String, url: URL) -> DatosPagina {
        let metas = metas(en: html)
        let producto = productoJsonLd(en: html)

        let titulo = limpio(metas["og:title"] ?? metas["twitter:title"] ?? titulo(en: html))
        let descripcion = limpio(metas["og:description"] ?? metas["description"]).map { String($0.prefix(4000)) }
        let imagen = (metas["og:image"] ?? metas["og:image:secure_url"] ?? metas["twitter:image"])
            .flatMap { urlSegura($0, base: url) }

        return DatosPagina(
            url: url,
            titulo: titulo,
            imagenUrl: imagen,
            precioTexto: precio(metas),
            descripcion: descripcion,
            jsonLd: producto
        )
    }

    // MARK: - JSON-LD

    static func productoJsonLd(en html: String) -> ValorJSON? {
        let patron = #"<script[^>]*type\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>"#
        for bloque in coincidencias(patron, en: html, grupo: 1) {
            let texto = bloque
                .replacingOccurrences(of: "<![CDATA[", with: "")
                .replacingOccurrences(of: "]]>", with: "")
            guard let datos = texto.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: datos, options: [.fragmentsAllowed]),
                  let valor = ValorJSON(json: json),
                  let producto = buscarProducto(valor)
            else { continue }
            return producto
        }
        return nil
    }

    /// Busca el nodo Product (o ProductGroup), que puede estar en una lista o dentro de @graph.
    static func buscarProducto(_ valor: ValorJSON, profundidad: Int = 0) -> ValorJSON? {
        guard profundidad <= 5 else { return nil }
        switch valor {
        case .lista(let elementos):
            for elemento in elementos {
                if let producto = buscarProducto(elemento, profundidad: profundidad + 1) { return producto }
            }
            return nil
        case .objeto(let objeto):
            let tipos: [String]
            switch objeto["@type"] {
            case .texto(let tipo): tipos = [tipo]
            case .lista(let lista): tipos = lista.compactMap(\.texto)
            default: tipos = []
            }
            if tipos.contains("Product") || tipos.contains("ProductGroup") { return valor }
            if let grafo = objeto["@graph"] { return buscarProducto(grafo, profundidad: profundidad + 1) }
            return nil
        default:
            return nil
        }
    }

    // MARK: - Etiquetas meta

    /// property/name/itemprop → content (en minúsculas; se queda con la primera aparición).
    static func metas(en html: String) -> [String: String] {
        var resultado: [String: String] = [:]
        for etiqueta in coincidencias(#"<meta\b[^>]*>"#, en: html, grupo: 0) {
            let atributos = atributos(de: etiqueta)
            guard let clave = (atributos["property"] ?? atributos["name"] ?? atributos["itemprop"])?.lowercased(),
                  let contenido = atributos["content"],
                  resultado[clave] == nil
            else { continue }
            resultado[clave] = decodificarEntidades(contenido)
        }
        return resultado
    }

    static func atributos(de etiqueta: String) -> [String: String] {
        let patron = #"([a-zA-Z_:\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#
        guard let regex = try? NSRegularExpression(pattern: patron) else { return [:] }
        var atributos: [String: String] = [:]
        for coincidencia in regex.matches(in: etiqueta, range: NSRange(etiqueta.startIndex..., in: etiqueta)) {
            guard let nombre = texto(coincidencia, grupo: 1, en: etiqueta) else { continue }
            let valor = texto(coincidencia, grupo: 2, en: etiqueta)
                ?? texto(coincidencia, grupo: 3, en: etiqueta)
                ?? texto(coincidencia, grupo: 4, en: etiqueta)
                ?? ""
            atributos[nombre.lowercased()] = valor
        }
        return atributos
    }

    static func titulo(en html: String) -> String? {
        coincidencias(#"<title[^>]*>(.*?)</title>"#, en: html, grupo: 1).first.map(decodificarEntidades)
    }

    /// "29.95 EUR" a partir de product:price:amount + product:price:currency (u og:price:*).
    static func precio(_ metas: [String: String]) -> String? {
        for prefijo in ["product:price", "og:price"] {
            if let importe = limpio(metas["\(prefijo):amount"]) {
                return [importe, limpio(metas["\(prefijo):currency"])].compactMap { $0 }.joined(separator: " ")
            }
        }
        return nil
    }

    // MARK: - Utilidades

    /// URL absoluta y https (el backend solo acepta imágenes https).
    static func urlSegura(_ texto: String, base: URL) -> URL? {
        guard let url = URL(string: texto.trimmingCharacters(in: .whitespaces), relativeTo: base)?.absoluteURL,
              var componentes = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }
        if componentes.scheme == "http" { componentes.scheme = "https" }
        guard componentes.scheme == "https", componentes.host != nil else { return nil }
        return componentes.url
    }

    static func decodificarEntidades(_ entrada: String) -> String {
        guard entrada.contains("&") else { return entrada }
        var resultado = entrada
        // Numéricas: &#233; y &#xE9;
        if let regex = try? NSRegularExpression(pattern: "&#(x?)([0-9a-fA-F]+);") {
            for coincidencia in regex.matches(in: resultado, range: NSRange(resultado.startIndex..., in: resultado)).reversed() {
                guard let rango = Range(coincidencia.range, in: resultado),
                      let digitos = texto(coincidencia, grupo: 2, en: resultado)
                else { continue }
                let esHex = texto(coincidencia, grupo: 1, en: resultado) == "x"
                guard let codigo = UInt32(digitos, radix: esHex ? 16 : 10), let escalar = Unicode.Scalar(codigo) else { continue }
                resultado.replaceSubrange(rango, with: String(Character(escalar)))
            }
        }
        let nombradas = ["&quot;": "\"", "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&euro;": "€"]
        for (entidad, caracter) in nombradas {
            resultado = resultado.replacingOccurrences(of: entidad, with: caracter)
        }
        return resultado.replacingOccurrences(of: "&amp;", with: "&")
    }

    static func limpio(_ texto: String?) -> String? {
        let limpio = texto?.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return limpio?.isEmpty == false ? limpio : nil
    }

    private static func coincidencias(_ patron: String, en html: String, grupo: Int) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: patron, options: [.caseInsensitive, .dotMatchesLineSeparators]) else {
            return []
        }
        return regex.matches(in: html, range: NSRange(html.startIndex..., in: html)).compactMap {
            texto($0, grupo: grupo, en: html)
        }
    }

    private static func texto(_ coincidencia: NSTextCheckingResult, grupo: Int, en cadena: String) -> String? {
        let rango = coincidencia.range(at: grupo)
        guard rango.location != NSNotFound, let rangoSwift = Range(rango, in: cadena) else { return nil }
        return String(cadena[rangoSwift])
    }
}
