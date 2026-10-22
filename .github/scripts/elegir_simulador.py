"""Elige un simulador de iPhone con la versión más reciente de iOS 26.

Lee la salida de `xcrun simctl list devices available -j` por la entrada estándar
y escribe el UDID del simulador elegido.
"""

import json
import re
import sys

PREFERIDOS = ["iPhone 17 Pro", "iPhone 17", "iPhone Air", "iPhone 16 Pro"]


def version(runtime: str) -> tuple[int, int]:
    coincidencia = re.search(r"iOS-(\d+)-(\d+)", runtime)
    return (int(coincidencia.group(1)), int(coincidencia.group(2))) if coincidencia else (0, 0)


dispositivos_por_runtime = json.load(sys.stdin)["devices"]
runtimes = sorted((r for r in dispositivos_por_runtime if "iOS-26" in r), key=version, reverse=True)

for runtime in runtimes:
    iphones = [
        d for d in dispositivos_por_runtime[runtime]
        if d.get("isAvailable") and d["name"].startswith("iPhone")
    ]
    if not iphones:
        continue
    elegido = next(
        (d for nombre in PREFERIDOS for d in iphones if d["name"] == nombre),
        iphones[0],
    )
    print(f"Simulador: {elegido['name']} ({runtime})", file=sys.stderr)
    print(elegido["udid"])
    sys.exit(0)

sys.exit("No hay ningún simulador de iPhone con iOS 26")
