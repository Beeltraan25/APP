import SafariServices
import SwiftUI

/// Safari dentro de la app (SFSafariViewController): comparte sesión con Safari y es lo que
/// esperan las tiendas. SwiftUI no lo ofrece, así que aquí UIKit es imprescindible.
/// Funciona también dentro de la Share Extension.
public struct NavegadorTienda: UIViewControllerRepresentable {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func makeUIViewController(context: Context) -> SFSafariViewController {
        let safari = SFSafariViewController(url: url)
        safari.dismissButtonStyle = .close
        return safari
    }

    public func updateUIViewController(_ safari: SFSafariViewController, context: Context) {}
}

/// Para abrir una tienda con `.sheet(item:)`.
public struct EnlaceTienda: Identifiable, Sendable {
    public let url: URL
    public var id: URL { url }

    public init(url: URL) {
        self.url = url
    }
}
