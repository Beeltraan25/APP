#!/usr/bin/env bash
# Instala la app en el simulador y hace una captura de cada pantalla, en modo claro y oscuro.
# Uso: capturas.sh <udid> <ruta a DupeFinder.app> <carpeta de salida>
set -euo pipefail

UDID="$1"
APP="$2"
SALIDA="$3"
BUNDLE="com.beeltraan25.dupefinder"
PANTALLAS=(inicio menu ficha resultados detalle outfits guardados outfitGuardado compartir inspiracion historial)

mkdir -p "$SALIDA"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 || true
xcrun simctl install "$UDID" "$APP"

for apariencia in light dark; do
  nombre=$([ "$apariencia" = light ] && echo claro || echo oscuro)
  xcrun simctl ui "$UDID" appearance "$apariencia"
  for pantalla in "${PANTALLAS[@]}"; do
    xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
    # La app lee "-captura <pantalla>" para abrirse directamente en esa pantalla.
    xcrun simctl launch "$UDID" "$BUNDLE" -captura "$pantalla"
    sleep 6
    xcrun simctl io "$UDID" screenshot "$SALIDA/$nombre-$pantalla.png"
    echo "Captura: $nombre-$pantalla.png"
  done
done

# Texto grande (accesibilidad): comprueba que nada se corta ni se solapa.
xcrun simctl ui "$UDID" appearance light
xcrun simctl ui "$UDID" content_size accessibility-extra-large
for pantalla in inicio resultados detalle outfits outfitGuardado compartir; do
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE" -captura "$pantalla"
  sleep 6
  xcrun simctl io "$UDID" screenshot "$SALIDA/grande-$pantalla.png"
  echo "Captura: grande-$pantalla.png"
done
xcrun simctl ui "$UDID" content_size large
