import DupeDiseno
import DupeNucleo
import SwiftData
import SwiftUI
import UIKit

/// Elegir estilo y presupuesto, y ver 3 outfits en un carrusel de collages.
struct OutfitsView: View {
    @Environment(EstadoCompartido.self) private var estado
    @Environment(\.modelContext) private var contexto
    @Environment(\.accessibilityReduceMotion) private var reducirMovimiento
    @Query private var guardados: [OutfitGuardado]

    @State private var vm: OutfitsViewModel
    @State private var escribiendoEstilo = false
    @State private var estiloEscrito = ""
    @State private var tiendaAbierta: EnlaceTienda?
    @State private var piezaACambiar: PiezaACambiar?

    init(servicio: any ServicioOutfits) {
        _vm = State(initialValue: OutfitsViewModel(servicio: servicio))
    }

    var body: some View {
        NavigationStack {
            Group {
                if let base = estado.prendaBase {
                    contenido(base)
                } else {
                    sinPrenda
                }
            }
            .navigationTitle("Outfits")
        }
        .sheet(item: $tiendaAbierta) { enlace in
            NavegadorTienda(url: enlace.url).ignoresSafeArea()
        }
        .sheet(item: $piezaACambiar) { cambio in
            CambiarPiezaSheet(
                cambio: cambio,
                presupuesto: vm.presupuesto,
                excluir: vm.productosEn(cambio.outfitId),
                servicio: vm.servicio
            ) { producto in
                vm.reemplazar(cambio, por: producto)
            }
        }
        .alert("Otro estilo", isPresented: $escribiendoEstilo) {
            TextField("p. ej. preppy, techwear…", text: $estiloEscrito)
                .textInputAutocapitalization(.never)
            Button("Usar") {
                let limpio = estiloEscrito.trimmingCharacters(in: .whitespacesAndNewlines)
                if limpio.count >= 2 { vm.estilo = limpio.lowercased() }
            }
            Button("Cancelar", role: .cancel) {}
        }
        .onChange(of: estado.prendaBase) { vm.reiniciar() }
        .task {
            if ModoCaptura.actual == .outfits, case .inactivo = vm.estado, let base = estado.prendaBase {
                await vm.generar(base: base)
            }
        }
    }

    // MARK: - Partes

    private var sinPrenda: some View {
        ContentUnavailableView {
            Label("Crea tu primer outfit", systemImage: "tshirt")
        } description: {
            Text("Busca una prenda y elige un estilo: te propondremos tres outfits completos con piezas de tiendas españolas.")
        } actions: {
            Button("Buscar una prenda") { estado.pestana = .buscar }
                .buttonStyle(.glassProminent)
        }
    }

    private func contenido(_ base: PrendaBase) -> some View {
        ScrollViewReader { desplazamiento in
            ScrollView {
                VStack(alignment: .leading, spacing: Espacio.l) {
                    Group {
                        tarjetaBase(base)
                        seccionEstilo
                        seccionPresupuesto
                        botonCrear(base)
                    }
                    .padding(.horizontal, 20)

                    resultados(base)
                        .id("resultados")
                }
                .padding(.vertical, Espacio.m)
            }
            // Al terminar, baja hasta los outfits: son lo importante.
            .onChange(of: vm.outfits.map(\.id)) { _, ids in
                guard !ids.isEmpty else { return }
                withAnimation(reducirMovimiento ? nil : .smooth) { desplazamiento.scrollTo("resultados", anchor: .top) }
            }
        }
    }

    private func tarjetaBase(_ base: PrendaBase) -> some View {
        HStack(spacing: Espacio.m) {
            Group {
                if let foto = base.fotoLocal, let imagen = UIImage(data: foto) {
                    Image(uiImage: imagen).resizable().scaledToFill()
                } else {
                    ImagenRemota(url: base.producto?.imagenUrl ?? base.imagenUrl)
                }
            }
            .frame(width: 56, height: 70)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text("Tu prenda")
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(base.nombre.conMayuscula)
                    .font(.headline)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Button("Cambiar") { estado.pestana = .buscar }
                .buttonStyle(.glass)
                .controlSize(.small)
        }
        .accessibilityElement(children: .contain)
    }

    private var seccionEstilo: some View {
        VStack(alignment: .leading, spacing: 10) {
            titulo("Estilo")
            FlujoChips {
                ForEach(EstilosSugeridos.todos, id: \.self) { estilo in
                    chipEstilo(estilo)
                }
                if let propio = vm.estilo, !EstilosSugeridos.todos.contains(propio) {
                    chipEstilo(propio)
                }
                Button {
                    estiloEscrito = ""
                    escribiendoEstilo = true
                } label: {
                    Label("Otro", systemImage: "pencil")
                        .font(.subheadline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.fill.tertiary, in: .capsule)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func chipEstilo(_ estilo: String) -> some View {
        let elegido = vm.estilo == estilo
        return Button { vm.estilo = estilo } label: {
            Text(estilo.conMayuscula)
                .font(.subheadline.weight(elegido ? .semibold : .regular))
                .foregroundStyle(elegido ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(elegido ? AnyShapeStyle(.tint) : AnyShapeStyle(.fill.tertiary), in: .capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(elegido ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: elegido)
    }

    private var seccionPresupuesto: some View {
        VStack(alignment: .leading, spacing: 10) {
            titulo("Máximo por prenda")
            Picker("Máximo por prenda", selection: $vm.presupuesto) {
                ForEach(PresupuestoPorPrenda.allCases) { opcion in
                    Text(opcion.tituloCorto)
                        .tag(opcion)
                        .accessibilityLabel(opcion.titulo)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    private func botonCrear(_ base: PrendaBase) -> some View {
        Button {
            Task { await vm.generar(base: base) }
        } label: {
            Label(vm.outfits.isEmpty ? "Crear outfits" : "Crear otros outfits", systemImage: "sparkles")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        .disabled(vm.estilo == nil || vm.generando)
    }

    @ViewBuilder
    private func resultados(_ base: PrendaBase) -> some View {
        switch vm.estado {
        case .inactivo:
            EmptyView()
        case .cargando:
            HStack(spacing: Espacio.m) {
                ProgressView()
                Text(vm.mensajeProgreso ?? "Preparando…")
                    .font(.subheadline)
                    .contentTransition(.opacity)
                    .animation(.smooth, value: vm.mensajeProgreso)
                Spacer(minLength: 0)
            }
            .padding(Espacio.m)
            .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 20)
            .accessibilityElement(children: .combine)
        case .error(let error):
            ContentUnavailableView {
                Label("No ha podido ser", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error.mensaje)
            } actions: {
                Button("Reintentar") { Task { await vm.generar(base: base) } }
                    .buttonStyle(.glass)
            }
        case .listo(let perfil):
            VStack(alignment: .leading, spacing: Espacio.m) {
                resumenEstilo(perfil)
                    .padding(.horizontal, 20)
                carrusel(base)
            }
        }
    }

    private func resumenEstilo(_ perfil: PerfilEstilo) -> some View {
        VStack(alignment: .leading, spacing: Espacio.s) {
            HStack(spacing: 4) {
                ForEach(perfil.paleta, id: \.hex) { color in
                    Circle()
                        .fill(Color(hex: color.hex) ?? .gray)
                        .frame(width: 14, height: 14)
                        .overlay(Circle().strokeBorder(.primary.opacity(0.15), lineWidth: 0.5))
                }
            }
            .accessibilityLabel("Paleta: \(perfil.paleta.map(\.nombre).joined(separator: ", "))")
            Text(perfil.resumen.conMayuscula)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func carrusel(_ base: PrendaBase) -> some View {
        ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: Espacio.m) {
                ForEach(vm.outfits) { outfit in
                    TarjetaOutfit(
                        outfit: outfit,
                        fotoBase: base.fotoLocal,
                        guardado: guardados.contains { $0.outfitId == outfit.id && $0.estilo == vm.estilo },
                        alTocarPieza: { pieza in
                            if let url = pieza.producto?.url { tiendaAbierta = EnlaceTienda(url: url) }
                        },
                        alCambiarPieza: { pieza in
                            piezaACambiar = PiezaACambiar(outfitId: outfit.id, pieza: pieza)
                        },
                        alGuardar: { alternarGuardado(outfit) }
                    )
                    .containerRelativeFrame(.horizontal) { ancho, _ in ancho * 0.86 }
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .contentMargins(.horizontal, 20, for: .scrollContent)
        .scrollIndicators(.hidden)
    }

    private func titulo(_ texto: String) -> some View {
        Text(texto)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
    }

    // MARK: - Guardar

    private func alternarGuardado(_ outfit: Outfit) {
        if let existente = guardados.first(where: { $0.outfitId == outfit.id && $0.estilo == vm.estilo }) {
            contexto.delete(existente)
            return
        }
        let guardado = OutfitGuardado(
            outfitId: outfit.id,
            titulo: outfit.titulo,
            estilo: vm.estilo ?? "",
            porQueEncaja: outfit.porQueEncaja,
            precioTotalCentimos: outfit.precioTotal.centimos
        )
        contexto.insert(guardado)
        for (orden, pieza) in outfit.piezas.enumerated() {
            let guardada = PiezaGuardada(
                orden: orden,
                rol: pieza.rol.rawValue,
                esPrendaBase: pieza.esPrendaBase,
                productoId: pieza.producto?.id ?? "base",
                titulo: pieza.producto?.titulo ?? pieza.descripcion,
                tiendaNombre: pieza.producto?.tienda.nombre ?? "",
                url: pieza.producto?.url,
                imagenUrl: pieza.imagenUrl,
                precioCentimos: pieza.producto?.precio?.centimos ?? 0
            )
            guardada.outfit = guardado
            contexto.insert(guardada)
        }
    }
}

#Preview {
    OutfitsView(servicio: ServicioOutfitsSimulado())
        .environment(EstadoCompartido())
        .modelContainer(for: [PrendaGuardada.self, OutfitGuardado.self], inMemory: true)
}
