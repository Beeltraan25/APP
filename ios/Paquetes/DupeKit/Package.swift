// swift-tools-version: 6.2
import PackageDescription

/// Código compartido por la app y (más adelante) la Share Extension.
let package = Package(
    name: "DupeKit",
    defaultLocalization: "es",
    platforms: [.iOS(.v26)],
    products: [
        // Modelos, datos simulados y utilidades. Solo depende de Foundation.
        .library(name: "DupeNucleo", targets: ["DupeNucleo"]),
        // Sistema de diseño en SwiftUI (chips, colores, espaciados).
        .library(name: "DupeDiseno", targets: ["DupeDiseno"]),
        // Lo que se ve en la Share Extension (también se usa en la app para las capturas).
        .library(name: "DupeCompartir", targets: ["DupeCompartir"]),
    ],
    targets: [
        .target(name: "DupeNucleo", resources: [.process("Simulados")]),
        .target(name: "DupeDiseno", dependencies: ["DupeNucleo"]),
        .target(name: "DupeCompartir", dependencies: ["DupeNucleo", "DupeDiseno"]),
        .testTarget(name: "DupeNucleoTests", dependencies: ["DupeNucleo", "DupeCompartir"]),
    ]
)
