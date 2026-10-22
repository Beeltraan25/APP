import Foundation
import UIKit

/// Reduce la foto antes de enviarla: menos datos móviles y el backend gasta menos CPU.
public enum PreparadorFoto {
    public static func jpeg(desde datos: Data, ladoMaximo: CGFloat = 1024, calidad: CGFloat = 0.75) -> Data? {
        guard let imagen = UIImage(data: datos), imagen.size.width > 0, imagen.size.height > 0 else { return nil }
        let escala = min(1, ladoMaximo / max(imagen.size.width, imagen.size.height))
        let tamano = CGSize(width: (imagen.size.width * escala).rounded(), height: (imagen.size.height * escala).rounded())

        let formato = UIGraphicsImageRendererFormat.default()
        formato.scale = 1
        let reducida = UIGraphicsImageRenderer(size: tamano, format: formato).image { _ in
            imagen.draw(in: CGRect(origin: .zero, size: tamano))
        }
        return reducida.jpegData(compressionQuality: calidad)
    }
}
