#!/usr/bin/env bash
# Publica las capturas y un resumen de errores en la rama "capturas" (se sobrescribe en cada ejecución).
# Así se puede revisar el diseño y los fallos de compilación sin tener un Mac.
set -euo pipefail

DESTINO=$(mktemp -d)
CORTO="${GITHUB_SHA:0:7}"

if [ -d capturas ]; then
  cp capturas/*.png "$DESTINO/" 2>/dev/null || true
fi

# Para cada registro: errores y avisos de Swift, y las últimas líneas.
for registro in registro-paquete.txt registro-app.txt registro-tests.txt; do
  [ -f "$registro" ] || continue
  base="${registro#registro-}"
  grep -E "error:|warning:|✘|failed|Test .* recorded an issue|Fatal error" "$registro" | sort -u | head -300 \
    > "$DESTINO/errores-$base" || true
  tail -120 "$registro" > "$DESTINO/final-$base"
done

{
  echo "# Capturas de la app"
  echo
  echo "Commit \`$CORTO\` · [ver la ejecución]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)"
  echo
  echo "Resultado: \`${RESULTADOS:-sin datos}\`"
  echo
  for imagen in "$DESTINO"/*.png; do
    [ -e "$imagen" ] || continue
    archivo=$(basename "$imagen")
    echo "### ${archivo%.png}"
    echo
    echo "<img src=\"$archivo\" width=\"300\">"
    echo
  done
} > "$DESTINO/README.md"

cd "$DESTINO"
git init -q -b capturas
git add -A
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -q -m "Capturas de $CORTO"
git push -q -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" capturas
echo "Publicado en la rama capturas"
