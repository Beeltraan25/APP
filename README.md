# Dupe Finder

App de iPhone para encontrar alternativas de ropa de hombre en tiendas que venden en España y crear outfits.

- **`web/`** — versión web para Safari (se añade a la pantalla de inicio como una app).
- **`ios/`** — app SwiftUI (iOS 26, Liquid Glass) y su Share Extension ("Dupe Finder" en la hoja de compartir). Sin backend configurado usa datos de prueba.
- **`backend/`** — Cloudflare Worker en TypeScript: análisis de prendas con Gemini, búsqueda y outfits.
- **`docs/ARQUITECTURA.md`** — decisiones, estructura y modelos de datos.

Todo funciona con planes gratuitos. Las claves (Gemini, SerpAPI…) viven solo en el backend y nunca se suben a este repositorio.

## App de iPhone sin Mac

Cada vez que se sube un cambio en `ios/`, GitHub Actions (en un Mac de GitHub):

1. genera el proyecto de Xcode con XcodeGen (`ios/project.yml`),
2. compila la app y pasa sus tests,
3. hace capturas del simulador en modo claro y oscuro, y otras con el texto más grande de accesibilidad,
4. las publica en la rama [`capturas`](../../tree/capturas), junto con un resumen de errores si algo falla.

Con un Mac: `brew install xcodegen`, `cd ios && xcodegen generate` y abrir `DupeFinder.xcodeproj`.

### Conectar la app al backend

Sin configuración, la app funciona con datos de prueba (lo indica en la pantalla de inicio). Para usar el backend:

1. Copia `ios/Config/Secretos.xcconfig.example` como `ios/Config/Secretos.xcconfig` (no se sube a git).
2. Pon en `URL_BACKEND` la dirección del backend (`http://127.0.0.1:8787` en el simulador con `npm run dev`, o la de Cloudflare para un iPhone real).
3. Pon en `CLAVE_APP` la misma clave que en `backend/.dev.vars`.
4. Vuelve a generar el proyecto (`xcodegen generate`) y compila. La Share Extension usa la misma configuración.

## Versión web (gratis, sin Apple ID)

Publicada en **https://dupe-finder.beeltraan25.workers.dev** (web y API en la misma dirección).

La carpeta `web/` es Dupe Finder para Safari: buscar por foto o enlace, ficha editable, alternativas con filtro de precio, outfits por estilo y guardados (en el propio iPhone). La sirve el mismo Worker que la API, así que al publicar el backend ya está en `https://dupe-finder.TU-SUBDOMINIO.workers.dev`.

1. Publica el backend (ver «Publicar el backend en Cloudflare»).
2. En el iPhone, abre esa dirección en Safari y toca el engranaje → pega tu `CLAVE_APP` → *Conectar*. También puedes abrir una vez `https://…workers.dev/#clave=TU_CLAVE`: la web guarda la clave y la borra de la dirección.
3. *Compartir → Añadir a pantalla de inicio*: se abre a pantalla completa, como una app.

Sin clave funciona en modo de prueba con datos de ejemplo. Para probarla en el PC: `npm run dev` en `backend` y abre http://localhost:8787.

Los enlaces los lee el servidor (Safari no deja que una web lea otras webs). Algunas tiendas lo bloquean (Zara, H&M…); entonces se usa como plan B el lector gratuito [Jina Reader](https://jina.ai/reader), y si tampoco puede, la web pide una captura de pantalla.

## Instalar en tu iPhone sin Mac

GitHub Actions genera en cada compilación un `.ipa` sin firmar. Se firma con tu Apple ID **gratuita** y se instala desde Windows con [Sideloadly](https://sideloadly.io).

1. **Descarga el .ipa:** pestaña *Actions* del repositorio → última ejecución **iOS** en verde → *Artifacts* → `DupeFinder-ipa`. Descomprime el zip: dentro está `DupeFinder.ipa`.
2. **(Opcional) Conéctalo a tu backend.** Sin esto, la app funciona con datos de prueba. Necesitas el backend publicado en Cloudflare (`127.0.0.1` no funciona desde el iPhone):
   ```
   powershell -ExecutionPolicy Bypass -File ios\scripts\configurar-ipa.ps1 -Ipa "$HOME\Downloads\DupeFinder.ipa" -UrlBackend "https://TU-WORKER.workers.dev"
   ```
   Crea `DupeFinder-configurada.ipa` con la dirección y la clave de `backend/.dev.vars`. Las claves nunca se suben a GitHub.
3. **Prepara Windows:** instala iTunes e iCloud **desde la web de Apple** (las versiones de Microsoft Store no funcionan con Sideloadly) y después Sideloadly.
4. **Conecta el iPhone por cable**, desbloquéalo y pulsa *Confiar en este ordenador*.
5. **En Sideloadly:** arrastra el `.ipa`, escribe tu Apple ID y pulsa *Start*. Es mejor usar una Apple ID secundaria.
6. **En el iPhone:**
   - *Ajustes → General → VPN y gestión de dispositivos* → confía en tu Apple ID.
   - *Ajustes → Privacidad y seguridad → Modo de desarrollador* → actívalo y reinicia.
7. **Cada 7 días** la firma gratuita caduca: vuelve a instalar con Sideloadly (los datos guardados se conservan) o activa su refresco automático por Wi‑Fi.

Con una Apple ID gratuita puedes tener como mucho 3 apps instaladas así. La Share Extension va incluida y aparece en la hoja de compartir como «Dupe Finder».

## Backend en local

Requisitos: Node.js 24.

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars   # y rellena las claves (Gemini, SerpAPI y la clave de la app)
npm run dev                      # http://localhost:8787
```

Comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm test` | Pasa los tests (no gasta cuota: la IA está simulada) |
| `npm run comprobar` | Revisa los tipos de TypeScript |
| `npm run dev` | Arranca el backend en local |
| `npm run desplegar` | Publica el Worker en Cloudflare |
| `npm run secretos` | Sube las claves de `.dev.vars` a Cloudflare (sin mostrarlas) |

## Publicar el backend en Cloudflare

Plan gratuito de Workers. Desde la carpeta `backend`, en PowerShell:

1. `npx wrangler login`: se abre el navegador para que entres en tu cuenta de Cloudflare (o la crees) y autorices a Wrangler.
2. `npm run desplegar`: crea los espacios KV, publica el Worker y muestra su dirección (`https://dupe-finder.TU-SUBDOMINIO.workers.dev`). La primera vez puede pedirte elegir un subdominio `workers.dev`.
3. `npm run secretos`: sube `GEMINI_API_KEY`, `SERPAPI_KEY` y `CLAVE_APP` desde `.dev.vars`.
4. Comprueba que funciona: `curl.exe https://dupe-finder.TU-SUBDOMINIO.workers.dev/v1/salud` debe responder `"estado":"ok"` y `true` en las tres claves.

Después, usa esa dirección con `ios\scripts\configurar-ipa.ps1` para instalar la app conectada al backend.
