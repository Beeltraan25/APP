# Dupe Finder

App de iPhone para encontrar alternativas de ropa de hombre en tiendas que venden en España y crear outfits.

- **`ios/`** — app SwiftUI (iOS 26, Liquid Glass). Por ahora funciona con datos de prueba.
- **`backend/`** — Cloudflare Worker en TypeScript: análisis de prendas con Gemini, búsqueda y outfits.
- **`docs/ARQUITECTURA.md`** — decisiones, estructura y modelos de datos.

Todo funciona con planes gratuitos. Las claves (Gemini, SerpAPI…) viven solo en el backend y nunca se suben a este repositorio.

## App de iPhone sin Mac

Cada vez que se sube un cambio en `ios/`, GitHub Actions (en un Mac de GitHub):

1. genera el proyecto de Xcode con XcodeGen (`ios/project.yml`),
2. compila la app y pasa sus tests,
3. hace capturas del simulador en modo claro y oscuro,
4. las publica en la rama [`capturas`](../../tree/capturas), junto con un resumen de errores si algo falla.

Con un Mac: `brew install xcodegen`, `cd ios && xcodegen generate` y abrir `DupeFinder.xcodeproj`.

### Conectar la app al backend

Sin configuración, la app funciona con datos de prueba (lo indica en la pantalla de inicio). Para usar el backend:

1. Copia `ios/Config/Secretos.xcconfig.example` como `ios/Config/Secretos.xcconfig` (no se sube a git).
2. Pon en `URL_BACKEND` la dirección del backend (`http://127.0.0.1:8787` en el simulador con `npm run dev`, o la de Cloudflare para un iPhone real).
3. Pon en `CLAVE_APP` la misma clave que en `backend/.dev.vars`.
4. Vuelve a generar el proyecto (`xcodegen generate`) y compila.

## Backend en local

Requisitos: Node.js 24.

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars   # y rellena las claves
npm run dev                      # http://localhost:8787
```

Comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm test` | Pasa los tests (no gasta cuota: la IA está simulada) |
| `npm run comprobar` | Revisa los tipos de TypeScript |
| `npm run dev` | Arranca el backend en local |
| `npm run desplegar` | Publica en Cloudflare (fase final) |
