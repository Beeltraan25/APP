import SwiftUI
import UIKit

/// Descarga imágenes una sola vez: memoria (NSCache) + disco (URLCache de 150 MB).
/// Si dos tarjetas piden la misma imagen a la vez, se descarga una vez.
public actor CacheImagenes {
    public static let compartida = CacheImagenes()

    private let memoria = NSCache<NSURL, UIImage>()
    private var enCurso: [URL: Task<UIImage?, Never>] = [:]
    private let sesion: URLSession

    public init() {
        let configuracion = URLSessionConfiguration.default
        configuracion.urlCache = URLCache(memoryCapacity: 20_000_000, diskCapacity: 150_000_000)
        configuracion.requestCachePolicy = .returnCacheDataElseLoad
        sesion = URLSession(configuration: configuracion)
        memoria.countLimit = 200
    }

    public func imagen(de url: URL) async -> UIImage? {
        if let guardada = memoria.object(forKey: url as NSURL) { return guardada }
        if let tarea = enCurso[url] { return await tarea.value }

        let tarea = Task { [sesion] () -> UIImage? in
            guard let resultado = try? await sesion.data(from: url),
                  ((resultado.1 as? HTTPURLResponse)?.statusCode ?? 200) < 400,
                  let imagen = UIImage(data: resultado.0)
            else { return nil }
            // Se descomprime ahora, fuera del hilo principal, para que el scroll vaya fluido.
            return await imagen.byPreparingForDisplay() ?? imagen
        }
        enCurso[url] = tarea
        let imagen = await tarea.value
        enCurso[url] = nil
        if let imagen { memoria.setObject(imagen, forKey: url as NSURL) }
        return imagen
    }
}

/// Foto de producto: limpia, sin vidrio encima. Mientras carga, un fondo neutro (sin spinner).
public struct ImagenRemota: View {
    private let url: URL?
    @State private var imagen: UIImage?
    @State private var fallo = false

    public init(url: URL?) {
        self.url = url
    }

    public var body: some View {
        ZStack {
            Rectangle().fill(.fill.tertiary)
            if let imagen {
                Image(uiImage: imagen)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            } else if fallo {
                Image(systemName: "photo")
                    .font(.title2)
                    .foregroundStyle(.tertiary)
            }
        }
        .clipped()
        .accessibilityHidden(true)
        .task(id: url) {
            guard let url else {
                fallo = true
                return
            }
            let descargada = await CacheImagenes.compartida.imagen(de: url)
            withAnimation(.easeOut(duration: 0.2)) {
                imagen = descargada
                fallo = descargada == nil
            }
        }
    }
}
