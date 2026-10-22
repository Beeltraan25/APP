import DupeNucleo
import SwiftUI

/// Espaciados de la app: mucho aire y siempre los mismos valores.
public enum Espacio {
    public static let xs: CGFloat = 4
    public static let s: CGFloat = 8
    public static let m: CGFloat = 16
    public static let l: CGFloat = 24
    public static let xl: CGFloat = 32
}

extension Color {
    /// Color a partir de "#RRGGBB". Null si el texto no es válido.
    public init?(hex: String) {
        var texto = hex.trimmingCharacters(in: .whitespaces)
        if texto.hasPrefix("#") { texto.removeFirst() }
        guard texto.count == 6, let valor = UInt32(texto, radix: 16) else { return nil }
        self.init(
            .sRGB,
            red: Double((valor >> 16) & 0xFF) / 255,
            green: Double((valor >> 8) & 0xFF) / 255,
            blue: Double(valor & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension ColorPrenda {
    public var color: Color? { Color(hex: hex) }
}

extension String {
    /// "vaqueros cargo" → "Vaqueros cargo"
    public var conMayuscula: String {
        prefix(1).uppercased() + dropFirst()
    }
}
