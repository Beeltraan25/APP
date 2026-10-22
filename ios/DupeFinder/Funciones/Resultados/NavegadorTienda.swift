import SafariServices
import SwiftUI

/// Safari dentro de la app (SFSafariViewController): comparte sesión con Safari y es lo que
/// esperan las tiendas. SwiftUI no lo ofrece, así que aquí UIKit es imprescindible.
struct NavegadorTienda: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let safari = SFSafariViewController(url: url)
        safari.dismissButtonStyle = .close
        return safari
    }

    func updateUIViewController(_ safari: SFSafariViewController, context: Context) {}
}

/// Para abrir una tienda con `.sheet(item:)`.
struct EnlaceTienda: Identifiable {
    let url: URL
    var id: URL { url }
}
