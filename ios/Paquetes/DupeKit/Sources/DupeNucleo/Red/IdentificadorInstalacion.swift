import Foundation
import Security

/// Identificador anónimo de esta instalación (sin registro). El backend lo usa para limitar
/// peticiones. Se guarda en el Llavero para que no cambie si se reinstala la app.
public enum IdentificadorInstalacion {
    private static let servicio = "com.beeltraan25.dupefinder"
    private static let cuenta = "instalacion"

    public static func actual() -> String {
        if let guardado = leerLlavero() { return guardado }
        if let guardado = UserDefaults.standard.string(forKey: cuenta) { return guardado }

        let nuevo = UUID().uuidString
        if !guardarLlavero(nuevo) {
            // Sin acceso al Llavero (p. ej. en algunos tests): al menos que dure mientras esté instalada.
            UserDefaults.standard.set(nuevo, forKey: cuenta)
        }
        return nuevo
    }

    private static func leerLlavero() -> String? {
        let consulta: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var resultado: AnyObject?
        guard SecItemCopyMatching(consulta as CFDictionary, &resultado) == errSecSuccess,
              let datos = resultado as? Data
        else { return nil }
        return String(data: datos, encoding: .utf8)
    }

    private static func guardarLlavero(_ valor: String) -> Bool {
        let atributos: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: cuenta,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecValueData as String: Data(valor.utf8),
        ]
        return SecItemAdd(atributos as CFDictionary, nil) == errSecSuccess
    }
}
