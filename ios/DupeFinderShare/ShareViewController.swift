import DupeCompartir
import SwiftUI
import UIKit

/// Punto de entrada de la Share Extension ("Dupe Finder" en la hoja de compartir).
/// Muestra la vista SwiftUI del paquete y le pasa lo que se ha compartido.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        let servicios = ServiciosCompartir.crear(infoPlist: Bundle.main.infoDictionary ?? [:])
        let modelo = ModeloCompartir(servicios: servicios)
        let vista = VistaCompartir(modelo: modelo) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }

        let anfitrion = UIHostingController(rootView: vista)
        addChild(anfitrion)
        anfitrion.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(anfitrion.view)
        NSLayoutConstraint.activate([
            anfitrion.view.topAnchor.constraint(equalTo: view.topAnchor),
            anfitrion.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            anfitrion.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            anfitrion.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        anfitrion.didMove(toParent: self)

        let adjuntos = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        Task {
            let entrada = await LectorCompartido.leer(adjuntos)
            await modelo.procesar(entrada)
        }
    }
}
