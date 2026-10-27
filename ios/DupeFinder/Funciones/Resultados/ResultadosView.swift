import DupeDiseno
import DupeNucleo
import SwiftUI

/// Alternativas a la prenda, con un selector de rango de precio arriba (vidrio nativo de iOS 26).
struct ResultadosView: View {
    @State private var vm: ResultadosViewModel
    @Environment(\.dynamicTypeSize) private var tamanoTexto
    @Environment(\.accessibilityReduceMotion) private var reducirMovimiento

    /// Dos columnas; con los tamaños de texto de accesibilidad, una (si no, los precios se parten).
    private var columnas: [GridItem] {
        let columna = GridItem(.flexible(), spacing: 12, alignment: .top)
        return tamanoTexto.isAccessibilitySize ? [columna] : [columna, columna]
    }

    init(peticion: PeticionResultados, servicio: any ServicioBusqueda) {
        _vm = State(initialValue: ResultadosViewModel(peticion: peticion, servicio: servicio))
    }

    var body: some View {
        ScrollViewReader { desplazamiento in
            ScrollView {
                VStack(alignment: .leading, spacing: Espacio.m) {
                    resumen
                    if let precio = vm.peticion.precioOriginal {
                        Label("Solo más baratas que tu prenda (\(precio.formateado))", systemImage: "tag")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    contenido
                    if case .listo = vm.estado {
                        BloqueInspiracion(estado: vm.inspiracion, columnas: columnas, precioOriginal: vm.peticion.precioOriginal) {
                            Task { await vm.cargarInspiracion() }
                        }
                        .id("inspiracion")
                    }
                }
                .padding(.horizontal, Espacio.m)
                .padding(.bottom, Espacio.xl)
            }
            // Cuando llegan las ideas de Pinterest, baja hasta ellas.
            .onChange(of: vm.inspiracion.valor?.rollo) { _, rollo in
                guard rollo != nil else { return }
                withAnimation(reducirMovimiento ? nil : .smooth) { desplazamiento.scrollTo("inspiracion", anchor: .top) }
            }
        }
        .navigationTitle("Alternativas")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaBar(edge: .top) { selectorRango }
        .refreshable { await vm.cargar() }
        .task {
            if case .inactivo = vm.estado { await vm.cargar() }
            if ModoCaptura.actual == .inspiracion { await vm.cargarInspiracion() }
        }
        .sensoryFeedback(.selection, trigger: vm.rango)
    }

    // MARK: - Partes

    private var selectorRango: some View {
        Picker("Rango de precio", selection: $vm.rango) {
            Text("Todo").tag(RangoPrecio?.none)
            ForEach(RangoPrecio.allCases) { rango in
                Text(rango.etiquetaCorta)
                    .tag(Optional(rango))
                    .accessibilityLabel("\(rango.titulo), \(rango.descripcion)")
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, Espacio.m)
        .padding(.vertical, Espacio.s)
    }

    /// De qué prenda son las alternativas y cuántas hay.
    private var resumen: some View {
        let ficha = vm.peticion.ficha
        let apilado = tamanoTexto.isAccessibilitySize
        let disposicion = apilado
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: 10))
        return disposicion {
            HStack(spacing: 10) {
                Circle()
                    .fill(ficha.colorPrincipal.color ?? .gray)
                    .frame(width: 14, height: 14)
                    .overlay(Circle().strokeBorder(.primary.opacity(0.2), lineWidth: 0.5))
                    .accessibilityHidden(true)
                Text((ficha.subcategoria ?? ficha.categoria).conMayuscula)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(apilado ? 3 : 1)
            }
            if !apilado { Spacer() }
            if case .listo = vm.estado {
                Text(vm.conteo(vm.rango) == 1 ? "1 alternativa" : "\(vm.conteo(vm.rango)) alternativas")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            }
        }
        .padding(.top, Espacio.s)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var contenido: some View {
        switch vm.estado {
        case .inactivo, .cargando:
            LazyVGrid(columns: columnas, spacing: Espacio.l) {
                ForEach(0..<6, id: \.self) { _ in TarjetaCargando() }
            }
            .accessibilityLabel("Buscando alternativas")
        case .listo:
            if vm.visibles.isEmpty {
                sinResultados
            } else if vm.deOtrosColores.isEmpty {
                rejilla(vm.visibles)
            } else {
                // Primero las del color de la prenda; después, las de otros colores.
                let ficha = vm.peticion.ficha
                if !vm.deTuColor.isEmpty {
                    cabeceraSeccion("En \(ficha.colorPrincipal.nombre) · \(vm.deTuColor.count)", color: ficha.colorPrincipal.color)
                    rejilla(vm.deTuColor)
                }
                cabeceraSeccion("En otros colores · \(vm.deOtrosColores.count)", color: nil)
                rejilla(vm.deOtrosColores)
            }
        case .error(let error):
            ContentUnavailableView {
                Label("No ha podido ser", systemImage: "exclamationmark.magnifyingglass")
            } description: {
                Text(error.mensaje)
            } actions: {
                Button("Reintentar") { Task { await vm.cargar() } }
                    .buttonStyle(.glass)
            }
            .frame(maxWidth: .infinity, minHeight: 420)
        }
    }

    private func rejilla(_ alternativas: [Alternativa]) -> some View {
        LazyVGrid(columns: columnas, spacing: Espacio.l) {
            ForEach(alternativas) { alternativa in
                NavigationLink(value: Destino.detalle(alternativa)) {
                    TarjetaAlternativa(alternativa: alternativa, precioOriginal: vm.peticion.precioOriginal)
                }
                .buttonStyle(.plain)
            }
        }
        .animation(.smooth, value: vm.rango)
    }

    private func cabeceraSeccion(_ texto: String, color: Color?) -> some View {
        HStack(spacing: 6) {
            if let color {
                Circle()
                    .fill(color)
                    .frame(width: 10, height: 10)
                    .overlay(Circle().strokeBorder(.primary.opacity(0.2), lineWidth: 0.5))
                    .accessibilityHidden(true)
            }
            Text(texto)
                .font(.footnote.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .padding(.top, Espacio.s)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private var sinResultados: some View {
        if vm.rango != nil && vm.conteo(nil) > 0 {
            ContentUnavailableView {
                Label("Nada en este rango", systemImage: "eurosign")
            } description: {
                Text("Prueba con otro rango de precio.")
            } actions: {
                Button("Ver todo") { vm.rango = nil }
                    .buttonStyle(.glass)
            }
            .frame(maxWidth: .infinity, minHeight: 420)
        } else {
            ContentUnavailableView {
                Label("Sin alternativas", systemImage: "magnifyingglass")
            } description: {
                Text("No hemos encontrado prendas parecidas en las tiendas de la lista. Prueba a ajustar la ficha.")
            }
            .frame(maxWidth: .infinity, minHeight: 420)
        }
    }
}

/// Placeholder sutil mientras se busca (sin spinner a pantalla completa).
private struct TarjetaCargando: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.fill.tertiary)
                .aspectRatio(3 / 4, contentMode: .fit)
            Capsule().fill(.fill.tertiary).frame(width: 60, height: 10)
            Capsule().fill(.fill.tertiary).frame(height: 12)
            Capsule().fill(.fill.tertiary).frame(width: 70, height: 12)
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    NavigationStack {
        ResultadosView(peticion: .ejemplo, servicio: ServicioBusquedaSimulado())
    }
    .environment(EstadoCompartido())
}
