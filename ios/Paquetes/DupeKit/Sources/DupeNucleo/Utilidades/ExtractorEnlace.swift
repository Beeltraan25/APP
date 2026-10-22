import Foundation

/// Encuentra el enlace de una prenda dentro de un texto copiado o compartido
/// (p. ej. "Mira esta sudadera https://www.zara.com/…").
public enum ExtractorEnlace {
    public static func primerEnlace(en texto: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let rango = NSRange(texto.startIndex..., in: texto)
        return detector.matches(in: texto, range: rango)
            .compactMap(\.url)
            .first { ["http", "https"].contains($0.scheme?.lowercased() ?? "") }
    }
}
