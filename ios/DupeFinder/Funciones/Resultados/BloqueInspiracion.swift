import DupeDiseno
import DupeNucleo
import SwiftUI

/// «Más del mismo rollo»: cómo se lleva la prenda en Pinterest y más prendas de ese estilo.
/// Se pide con un botón porque gasta varias búsquedas de SerpAPI.
struct BloqueInspiracion: View {
    let estado: EstadoCarga<RespuestaInspiracion>
    let columnas: [GridItem]
    let alPedir: () -> Void

    @State private var pinAbierto: EnlaceTienda?

    var body: some View {
        VStack(alignment: .leading, spacing: Espacio.m) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Más del mismo rollo")
                    .font(.title2.bold())
                Text("Miramos cómo se lleva esta prenda en Pinterest y te proponemos prendas muy parecidas, también en otros colores.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            switch estado {
            case .inactivo:
                Button(action: alPedir) {
                    Label("Ver ideas de Pinterest", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.large)
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            case .cargando:
                VStack(spacing: Espacio.s) {
                    HStack(spacing: Espacio.s) {
                        ProgressView()
                        Text("Buscando inspiración en Pinterest…")
                    }
                    Text("Tarda casi un minuto: comparamos cada prenda con tu foto.")
                        .font(.footnote)
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            case .error(let error):
                Text(error.mensaje)
                    .font(.subheadline)
                Button("Reintentar", action: alPedir)
                    .buttonStyle(.glass)
            case .listo(let datos):
                resultado(datos)
            }
        }
        .padding(.top, Espacio.l)
        .sheet(item: $pinAbierto) { enlace in
            NavegadorTienda(url: enlace.url).ignoresSafeArea()
        }
    }

    @ViewBuilder
    private func resultado(_ datos: RespuestaInspiracion) -> some View {
        Text(datos.rollo)
            .padding(Espacio.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

        if !datos.referencias.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Espacio.s) {
                    ForEach(datos.referencias) { referencia in
                        Button {
                            if let enlace = referencia.enlace { pinAbierto = EnlaceTienda(url: enlace) }
                        } label: {
                            ImagenRemota(url: referencia.imagen)
                                .frame(width: 104, height: 150)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(referencia.titulo ?? "Referencia de Pinterest")
                        .accessibilityHint(referencia.enlace == nil ? "" : "Abre el pin")
                    }
                }
                .padding(.horizontal, Espacio.m)
            }
            .padding(.horizontal, -Espacio.m)
            .accessibilityLabel("Referencias de Pinterest")
        }

        if datos.ideas.isEmpty {
            Text("No hemos encontrado más prendas de este estilo en las tiendas de la lista.")
                .foregroundStyle(.secondary)
        }

        ForEach(datos.ideas) { idea in
            VStack(alignment: .leading, spacing: Espacio.s) {
                Text(idea.titulo)
                    .font(.headline)
                LazyVGrid(columns: columnas, spacing: Espacio.l) {
                    ForEach(idea.productos) { producto in
                        let alternativa = Alternativa(producto: producto)
                        NavigationLink(value: Destino.detalle(alternativa)) {
                            TarjetaAlternativa(alternativa: alternativa)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, Espacio.s)
        }
    }
}
