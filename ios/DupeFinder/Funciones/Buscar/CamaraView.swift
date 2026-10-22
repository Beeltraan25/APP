import SwiftUI
import UIKit

/// Cámara del sistema. SwiftUI no tiene una vista de cámara, así que aquí UIKit es imprescindible.
struct CamaraView: UIViewControllerRepresentable {
    /// Devuelve la foto en JPEG, o nil si el usuario cancela.
    let alTerminar: (Data?) -> Void

    static var disponible: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let selector = UIImagePickerController()
        selector.sourceType = .camera
        selector.delegate = context.coordinator
        return selector
    }

    func updateUIViewController(_ selector: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinador {
        Coordinador(alTerminar: alTerminar)
    }

    final class Coordinador: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let alTerminar: (Data?) -> Void

        init(alTerminar: @escaping (Data?) -> Void) {
            self.alTerminar = alTerminar
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            let imagen = info[.originalImage] as? UIImage
            alTerminar(imagen?.jpegData(compressionQuality: 0.9))
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            alTerminar(nil)
        }
    }
}
