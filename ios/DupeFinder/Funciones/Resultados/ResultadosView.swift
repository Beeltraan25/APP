import DupeDiseno
import DupeNucleo
import SwiftUI

/// Alternativas a la prenda, con un selector de rango de precio arriba (vidrio nativo de iOS 26).
struct ResultadosView: View {
    @State private var vm: ResultadosViewModel

    private let columnas = [
        GridItem(.flexible(), spacing: 12, alignment: .top),
        GridItem(.flexible(), spacing: 12, alignment: .top),
    ]

    init(peticion: PeticionResultados, servicio: any ServicioBusqueda) {
        _vm = State(initialValue: ResultadosViewModel(peticion: peticion, servicio: servicio))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Espacio.m) {
                resumen
                contenido
            }
            .padding(.horizontal, Espacio.m)
            .padding(.bottom, Espacio.xl)
        }
        .navigationTitle("Alternativas")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaBar(edge: .top) { selectorRango }
        .refreshable { await vm.cargar() }
        .task {
            if case .inactivo = vm.estado { await vm.cargar() }
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
        return HStack(spacing: 10) {
            Circle()
                .fill(ficha.colorPrincipal.color ?? .gray)
                .frame(width: 14, height: 14)
                .overlay(Circle().strokeBorder(.primary.opacity(0.2), lineWidth: 0.5))
                .accessibilityHidden(true)
            Text((ficha.subcategoria ?? ficha.categoria).conMayuscula)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
            Spacer()
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
            } else {
                LazyVGrid(columns: columnas, spacing: Espacio.l) {
                    ForEach(vm.visibles) { alternativa in
                        NavigationLink(value: Destino.detalle(alternativa)) {
                            TarjetaAlternativa(alternativa: alternativa)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .animation(.smooth, value: vm.rango)
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
