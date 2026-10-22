# Dupe Finder

App de iPhone para encontrar alternativas de ropa de hombre en tiendas que venden en España y crear outfits.

- **`ios/`** — app SwiftUI (iOS 26, Liquid Glass). *Llega en la fase 1.*
- **`backend/`** — Cloudflare Worker en TypeScript: análisis de prendas con Gemini, búsqueda y outfits.
- **`docs/ARQUITECTURA.md`** — decisiones, estructura y modelos de datos.

Todo funciona con planes gratuitos. Las claves (Gemini, SerpAPI…) viven solo en el backend y nunca se suben a este repositorio.

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
