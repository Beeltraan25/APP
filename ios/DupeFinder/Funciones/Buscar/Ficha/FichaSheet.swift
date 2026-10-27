import DupeDiseno
import DupeNucleo
import SwiftUI
import UIKit

/// Hoja con la ficha técnica. El usuario la revisa (y corrige) antes de buscar alternativas.
struct FichaSheet: View {
    @State private var vm: FichaViewModel
    @State private var tamano: PresentationDetent
    @Environment(\.dismiss) private var cerrar

    @State private var campoEditando: CampoEditable?
    @State private var listaAnadiendo: ListaFicha?
    @State private var textoEditado = ""
    @State private var editandoPrecio = false
    /// Se llama con la ficha revisada al pulsar "Buscar alternativas".
    private let alBuscar: (FichaPrenda, Precio?) -> Void
    /// Se llama con la ficha revisada al pulsar "Crear outfits".
    private let alCrearOutfits: (FichaPrenda) -> Void

    init(
        analisis: AnalisisPresentado,
        alBuscar: @escaping (FichaPrenda, Precio?) -> Void = { _, _ in },
        alCrearOutfits: @escaping (FichaPrenda) -> Void = { _ in }
    ) {
        _vm = State(initialValue: FichaViewModel(analisis: analisis))
        self.alBuscar = alBuscar
        self.alCrearOutfits = alCrearOutfits
        _tamano = State(initialValue: ModoCaptura.actual == .ficha ? .large : .medium)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    cabecera
                    seccionPrecio
                    seccion("Aspecto") {
                        chipTexto(.color, muestra: vm.ficha.colorPrincipal.color)
                        chipTexto(.estampado)
                        chipTexto(.acabado)
                    }
                    seccion("Tejido") {
                        chipTexto(.material)
                        if let composicion = vm.ficha.composicionTexto {
                            Chip(composicion, titulo: "Composición", estimado: vm.esEstimado("composicion"))
                        }
                        menuGramaje
                    }
                    seccion("Corte") {
                        menuFit
                        chipTexto(.largo)
                        chipTexto(.cuello)
                        chipTexto(.mangas)
                        chipTexto(.cierres)
                    }
                    seccionLista("Detalles", elementos: vm.ficha.detalles, lista: .detalles, estimado: vm.esEstimado("detalles"))
                    seccionLista("Búsqueda", elementos: vm.ficha.palabrasClaveBusqueda, lista: .palabrasClave, estimado: false)
                    if vm.hayEstimados {
                        Label("Datos deducidos por la IA. Toca cualquiera para corregirlo.", systemImage: "sparkles")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, Espacio.s)
                .padding(.bottom, 96)
            }
            .navigationTitle("Ficha de la prenda")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", systemImage: "xmark") { cerrar() }
                }
            }
            // safeAreaBar (iOS 26) difumina el contenido bajo el botón, como las barras del sistema.
            .safeAreaBar(edge: .bottom) { botonBuscar.dynamicTypeSize(...DynamicTypeSize.xxxLarge) }
        }
        .presentationDetents([.medium, .large], selection: $tamano)
        .presentationDragIndicator(.visible)
        .alert(campoEditando?.titulo ?? "Editar", isPresented: editandoCampo, presenting: campoEditando) { campo in
            TextField(campo.titulo, text: $textoEditado)
            Button("Guardar") { vm.actualizar(campo, a: textoEditado) }
            Button("Cancelar", role: .cancel) {}
        }
        .alert("¿Cuánto cuesta tu prenda?", isPresented: $editandoPrecio) {
            TextField("Precio en euros", text: $textoEditado)
                .keyboardType(.decimalPad)
            Button("Guardar") { vm.cambiarPrecio(textoEditado) }
            if vm.precio != nil {
                Button("Quitar precio", role: .destructive) { vm.cambiarPrecio("") }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Solo te enseñaremos alternativas más baratas.")
        }
        .alert(listaAnadiendo?.titulo ?? "Añadir", isPresented: anadiendoEnLista, presenting: listaAnadiendo) { lista in
            TextField("Escribe aquí", text: $textoEditado)
            Button("Añadir") { vm.anadir(textoEditado, a: lista) }
            Button("Cancelar", role: .cancel) {}
        }
    }

    // MARK: - Partes

    private var cabecera: some View {
        HStack(alignment: .top, spacing: Espacio.m) {
            miniatura
            VStack(alignment: .leading, spacing: Espacio.xs) {
                Button { editar(.categoria) } label: {
                    HStack(spacing: 6) {
                        Text(vm.ficha.categoria.conMayuscula)
                            .font(.title2.bold())
                        Image(systemName: "pencil")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityHint("Toca para corregir")

                if let subcategoria = vm.ficha.subcategoria {
                    Text(subcategoria.conMayuscula)
                        .foregroundStyle(.secondary)
                }
                if let origen = vm.respuesta.productoOrigen {
                    Text([origen.tienda.nombre, origen.precio?.formateado].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /// Precio de la prenda: con él, solo se buscan alternativas más baratas.
    private var seccionPrecio: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Precio")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Button {
                textoEditado = vm.precio.map { String(format: "%.2f", Double($0.centimos) / 100).replacingOccurrences(of: ".", with: ",") } ?? ""
                editandoPrecio = true
            } label: {
                Chip(vm.precio?.formateado ?? "Añadir precio", titulo: "Tu prenda cuesta")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Toca para cambiarlo")
            Text(vm.precio == nil
                 ? "Pon cuánto cuesta y solo te enseñaremos alternativas más baratas."
                 : "Solo te enseñaremos alternativas más baratas.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    /// La foto del usuario o la de la tienda. Sin vidrio encima: es contenido.
    @ViewBuilder
    private var miniatura: some View {
        let forma = RoundedRectangle(cornerRadius: 14, style: .continuous)
        Group {
            if let foto = vm.foto, let imagen = UIImage(data: foto) {
                Image(uiImage: imagen).resizable().scaledToFill()
            } else if let url = vm.respuesta.productoOrigen?.imagenUrl {
                AsyncImage(url: url) { imagen in
                    imagen.resizable().scaledToFill()
                } placeholder: {
                    forma.fill(.fill.tertiary)
                }
            } else {
                forma.fill(.fill.tertiary)
                    .overlay(Image(systemName: "tshirt").font(.title2).foregroundStyle(.tertiary))
            }
        }
        .frame(width: 84, height: 104)
        .clipShape(forma)
        .accessibilityHidden(true)
    }

    private func seccion<Contenido: View>(_ titulo: String, @ViewBuilder contenido: () -> Contenido) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titulo)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            FlujoChips { contenido() }
        }
    }

    private func seccionLista(_ titulo: String, elementos: [String], lista: ListaFicha, estimado: Bool) -> some View {
        seccion(titulo) {
            ForEach(elementos, id: \.self) { elemento in
                Chip(elemento, estimado: estimado) { vm.quitar(elemento, de: lista) }
            }
            Button {
                textoEditado = ""
                listaAnadiendo = lista
            } label: {
                Image(systemName: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(width: 34, height: 34)
                    .background(.fill.tertiary, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(lista.titulo)
        }
    }

    @ViewBuilder
    private func chipTexto(_ campo: CampoEditable, muestra: Color? = nil) -> some View {
        if let valor = vm.ficha[keyPath: campo.ruta] {
            Button { editar(campo) } label: {
                Chip(valor.conMayuscula, titulo: campo.titulo, estimado: vm.esEstimado(campo.id), muestra: muestra)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Toca para corregir")
        }
    }

    private var menuFit: some View {
        Menu {
            Picker("Fit", selection: Binding(
                get: { vm.ficha.fit },
                set: { if let fit = $0 { vm.cambiarFit(fit) } }
            )) {
                ForEach(Fit.allCases, id: \.self) { fit in
                    Text(fit.titulo).tag(Optional(fit))
                }
            }
        } label: {
            Chip(vm.ficha.fit?.titulo ?? "Sin datos", titulo: "Fit", estimado: vm.esEstimado("fit"))
        }
        .buttonStyle(.plain)
    }

    private var menuGramaje: some View {
        Menu {
            Picker("Gramaje", selection: Binding(
                get: { vm.ficha.gramajeEstimado },
                set: { if let gramaje = $0 { vm.cambiarGramaje(gramaje) } }
            )) {
                ForEach(GramajeEstimado.allCases, id: \.self) { gramaje in
                    Text(gramaje.titulo).tag(Optional(gramaje))
                }
            }
        } label: {
            Chip(
                vm.ficha.gramajeTexto ?? "Sin datos",
                titulo: "Gramaje",
                estimado: vm.esEstimado("gramaje_estimado") || vm.esEstimado("gramaje_gsm")
            )
        }
        .buttonStyle(.plain)
    }

    private var botonBuscar: some View {
        HStack(spacing: Espacio.s) {
            Button {
                let ficha = vm.ficha
                let precio = vm.precio
                cerrar()
                alBuscar(ficha, precio)
            } label: {
                Label("Buscar alternativas", systemImage: "magnifyingglass")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)

            Button {
                let ficha = vm.ficha
                cerrar()
                alCrearOutfits(ficha)
            } label: {
                Image(systemName: "tshirt")
                    .font(.headline)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.glass)
            .accessibilityLabel("Crear outfits con esta prenda")
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .padding(.bottom, Espacio.s)
    }

    // MARK: - Edición

    private func editar(_ campo: CampoEditable) {
        textoEditado = vm.ficha[keyPath: campo.ruta] ?? ""
        campoEditando = campo
    }

    private var editandoCampo: Binding<Bool> {
        Binding(get: { campoEditando != nil }, set: { if !$0 { campoEditando = nil } })
    }

    private var anadiendoEnLista: Binding<Bool> {
        Binding(get: { listaAnadiendo != nil }, set: { if !$0 { listaAnadiendo = nil } })
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        FichaSheet(analisis: AnalisisPresentado(respuesta: DatosSimulados.analisisEnlace, foto: nil))
    }
}
