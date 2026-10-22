import DupeDiseno
import DupeNucleo
import PhotosUI
import SwiftUI
import UIKit

/// Inicio: una sola acción principal, "Buscar prenda", que se abre en Cámara / Fotos / Pegar enlace.
struct BuscarView: View {
    @State private var vm: BuscarViewModel
    @Namespace private var cristal

    @State private var menuAbierto = false
    @State private var fotoElegida: PhotosPickerItem?
    @State private var mostrandoCamara = false
    @State private var avisoSinCamara = false
    @State private var pidiendoEnlace = false
    @State private var textoEnlace = ""
    @State private var hayEnlaceCopiado = false
    @Environment(\.scenePhase) private var fase

    init(servicio: any ServicioAnalisis) {
        _vm = State(initialValue: BuscarViewModel(servicio: servicio))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()
                presentacion
                Spacer()
                acciones
                sugerenciaPortapapeles
                    .frame(minHeight: 110, alignment: .top)
                Spacer()
            }
            .padding(.horizontal, Espacio.l)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .bottom) {
                if vm.analizando { pildoraAnalizando }
            }
            .animation(.smooth, value: vm.analizando)
            .toolbar(.hidden, for: .navigationBar)
        }
        .sheet(item: $vm.analisis) { analisis in
            FichaSheet(analisis: analisis)
        }
        .fullScreenCover(isPresented: $mostrandoCamara) {
            CamaraView { datos in
                mostrandoCamara = false
                guard let datos else { return }
                Task { await vm.analizarFoto(datos) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: fotoElegida) { _, item in
            guard let item else { return }
            Task { await cargarFoto(item) }
        }
        .alert("Pegar enlace", isPresented: $pidiendoEnlace) {
            TextField("https://www.zara.com/…", text: $textoEnlace)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Buscar") { buscarEnlaceEscrito() }
            Button("Cancelar", role: .cancel) { textoEnlace = "" }
        } message: {
            Text("Mantén pulsado el campo y elige Pegar.")
        }
        .alert("Cámara no disponible", isPresented: $avisoSinCamara) {
            Button("Vale", role: .cancel) {}
        } message: {
            Text("Este dispositivo no tiene cámara. Elige una foto de tu galería.")
        }
        .alert("No ha podido ser", isPresented: hayError) {
            Button("Vale", role: .cancel) {}
        } message: {
            Text(vm.mensajeError ?? "")
        }
        .onChange(of: fase, initial: true) { _, nuevaFase in
            if nuevaFase == .active { hayEnlaceCopiado = UIPasteboard.general.hasURLs }
        }
        .task { await prepararCaptura() }
    }

    // MARK: - Partes

    private var presentacion: some View {
        VStack(spacing: Espacio.s) {
            Text("Encuentra el dupe")
                .font(.largeTitle.bold())
            Text("Haz una foto o pega el enlace de una prenda y te enseñamos alternativas parecidas en tiendas de España.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, Espacio.s)
    }

    /// El botón principal se transforma (morph de Liquid Glass) en las tres opciones.
    private var acciones: some View {
        GlassEffectContainer(spacing: 20) {
            VStack(spacing: 14) {
                if menuAbierto {
                    Button { abrirCamara() } label: {
                        etiquetaOrigen("Cámara", simbolo: "camera")
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .glassEffectID("camara", in: cristal)

                    PhotosPicker(selection: $fotoElegida, matching: .images) {
                        etiquetaOrigen("Fotos", simbolo: "photo.on.rectangle")
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .glassEffectID("fotos", in: cristal)

                    Button { pidiendoEnlace = true } label: {
                        etiquetaOrigen("Pegar enlace", simbolo: "link")
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .glassEffectID("enlace", in: cristal)

                    Button { cambiarMenu(abierto: false) } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 48, height: 48)
                            .contentShape(.circle)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: .circle)
                    .glassEffectID("cerrar", in: cristal)
                    .accessibilityLabel("Cerrar opciones")
                } else {
                    Button { cambiarMenu(abierto: true) } label: {
                        Label("Buscar prenda", systemImage: "sparkle.magnifyingglass")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 36)
                            .padding(.vertical, 20)
                            .contentShape(.capsule)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.tint(.accentColor).interactive(), in: .capsule)
                    .glassEffectID("principal", in: cristal)
                    .accessibilityHint("Elige cámara, fotos o un enlace")
                }
            }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: menuAbierto)
        .disabled(vm.analizando)
    }

    private func etiquetaOrigen(_ titulo: String, simbolo: String) -> some View {
        Label(titulo, systemImage: simbolo)
            .font(.headline)
            .frame(minWidth: 220)
            .padding(.horizontal, Espacio.l)
            .padding(.vertical, 16)
            .contentShape(.capsule)
    }

    /// Si hay un enlace copiado, se ofrece pegarlo con un toque. PasteButton no muestra el aviso de privacidad de iOS.
    @ViewBuilder
    private var sugerenciaPortapapeles: some View {
        if hayEnlaceCopiado && !menuAbierto && !vm.analizando {
            VStack(spacing: 10) {
                Text("Tienes un enlace copiado")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                PasteButton(payloadType: String.self) { textos in
                    guard let texto = textos.first else { return }
                    Task { await vm.analizarEnlace(texto: texto) }
                }
                .buttonBorderShape(.capsule)
                .labelStyle(.titleAndIcon)
            }
            .padding(.top, Espacio.l)
            .transition(.opacity)
        }
    }

    private var pildoraAnalizando: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Analizando la prenda…")
        }
        .font(.subheadline.weight(.medium))
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .glassEffect(.regular, in: .capsule)
        .padding(.bottom, Espacio.l)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }

    private var hayError: Binding<Bool> {
        Binding(
            get: { vm.mensajeError != nil },
            set: { if !$0 { vm.mensajeError = nil } }
        )
    }

    // MARK: - Acciones

    private func cambiarMenu(abierto: Bool) {
        withAnimation(.bouncy) { menuAbierto = abierto }
    }

    private func abrirCamara() {
        if CamaraView.disponible {
            mostrandoCamara = true
        } else {
            avisoSinCamara = true
        }
    }

    private func cargarFoto(_ item: PhotosPickerItem) async {
        defer { fotoElegida = nil }
        guard let datos = try? await item.loadTransferable(type: Data.self) else {
            vm.mensajeError = "No hemos podido cargar esa foto. Prueba con otra."
            return
        }
        cambiarMenu(abierto: false)
        await vm.analizarFoto(datos)
    }

    private func buscarEnlaceEscrito() {
        let texto = textoEnlace
        textoEnlace = ""
        cambiarMenu(abierto: false)
        Task { await vm.analizarEnlace(texto: texto) }
    }

    private func prepararCaptura() async {
        switch ModoCaptura.actual {
        case .menu: menuAbierto = true
        case .ficha: await vm.analizar(.foto(Data()))
        default: break
        }
    }
}

#Preview {
    BuscarView(servicio: ServicioAnalisisSimulado())
}
