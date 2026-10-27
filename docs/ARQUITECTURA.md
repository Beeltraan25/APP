# Dupe Finder — Propuesta de arquitectura (para revisar antes de escribir código)

Estado: **v3 · 22/10/2026**.
- v2: **todo con planes gratuitos** (la app no se va a publicar por ahora).
- v3: decisiones tuyas aplicadas: **solo ropa de hombre**, **presupuesto por prenda**, **ficha antes de buscar**. Gemini usa el plan gratuito de la API (tu suscripción de la app de Gemini no incluye la API).

---

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Coste | **0 €.** Solo servicios con plan gratuito y sin tarjeta |
| Público | **Solo ropa de hombre** por ahora. El campo `publico` se mantiene en la ficha para poder ampliar más adelante |
| App | iOS 26+, SwiftUI, Swift 6, MVVM con `@Observable`, SwiftData para guardados |
| Backend | Cloudflare Workers (plan gratuito) + TypeScript (router **Hono**, validación con **Zod**) |
| Caché y fotos temporales | **Workers KV** (gratis). No usamos R2 porque pide tarjeta incluso en su plan gratuito |
| IA (fichas y estilos) | **Gemini API, plan gratuito**, con salida JSON estructurada. Modelo principal `gemini-3.8-flash`, respaldo `gemini-3.5-flash-lite`, configurables por variable. (La suscripción Google AI Pro/Ultra es de la app de Gemini y no da acceso a la API) |
| Similitud visual | **`gemini-embedding-2`** (embeddings de imagen, gratis) en lugar de CLIP |
| Búsqueda en tiendas | SerpAPI, plan gratuito (≈250 consultas/mes) |
| IA intercambiable | Toda la IA pasa por una interfaz `ProveedorIA`: si algún día quieres usar Claude u otra, se añade sin tocar el resto |
| Compilación iOS sin Mac | GitHub Actions en un **repositorio público** (minutos de macOS gratis e ilimitados) |
| Nombres en el código | **Español** para dominio y servicios (`FichaPrenda`, `colorPrincipal`, `ServicioBusqueda`). Se mantienen los sufijos habituales de SwiftUI en inglés: `View`, `ViewModel` |
| JSON de la API | `snake_case` en español, igual que tu especificación. En Swift se decodifica con `.convertFromSnakeCase` (`color_principal` → `colorPrincipal`) |
| Repositorio | Un único repositorio (monorepo) con `ios/` y `backend/` |

## 2. Cómo encaja todo en los planes gratuitos

| Servicio | Plan gratuito | Qué gastamos | Cómo lo estiramos |
|---|---|---|---|
| **Cloudflare Workers** | 100.000 peticiones/día · **10 ms de CPU por petición** · 50 subpeticiones | Muy poco | El trabajo pesado se hace en el iPhone (ver abajo); el backend solo coordina |
| **Workers KV** | 100.000 lecturas/día · 1.000 escrituras/día · 1 GB | 1–2 escrituras por búsqueda | Más que suficiente para uso personal |
| **Gemini API** | Cuota diaria por proyecto (se ve en Google AI Studio). Sin tarjeta | 1 llamada por ficha · 1 de embeddings por búsqueda · 2–3 por tanda de outfits | Si se agota la cuota del modelo principal, se pasa al de respaldo |
| **SerpAPI** | ≈250 consultas/mes, máx. 50/hora | 1–2 por búsqueda · ≈5–7 por tanda de outfits | Caché de 24 h por búsqueda · perfiles de estilo cacheados 30 días · Google Shopping solo si Lens da pocos resultados de la lista blanca |
| **GitHub Actions** | Ilimitado en repos públicos (también macOS) | Una compilación por cambio | — |
| **Apple** | Apple ID gratuito | — | Simulador e iPhone propio (reinstalar cada 7 días desde un Mac) |

Con SerpAPI calculamos unas **60–80 búsquedas y 10–12 tandas de outfits al mes**. Es el límite más ajustado. Por eso la caché y el orden de las consultas importan.

**Para no pasar de 10 ms de CPU en el backend, el iPhone hace el trabajo pesado:**
- **Leer la página del producto (enlaces):** el iPhone la descarga y extrae JSON-LD y `og:*`. Así, además, las tiendas no bloquean la petición como suelen hacer con los servidores.
- **Reducir la foto** a ~1024 px en JPEG antes de enviarla.
- El backend solo llama a SerpAPI y a Gemini (esperar respuestas no gasta CPU), filtra y puntúa.

**Condiciones de Gemini que debes conocer:**
- Los términos exigen ser **mayor de 18 años**.
- En el Espacio Económico Europeo, el plan gratuito vale para uso propio y pruebas. Si algún día publicas la app para usuarios en España, los términos obligan a pasar al plan de pago.
- Las cuotas gratuitas pueden cambiar y a veces las respuestas son lentas. Por eso hay modelo de respaldo y la IA es intercambiable.

## 3. Qué cambia al no tener Mac

- **Xcode solo funciona en macOS.** Sin Mac no se puede ejecutar el simulador en local ni instalar en tu iPhone.
- Para no bloquearnos:
  1. **No escribiremos el `.xcodeproj` a mano** (es un formato frágil). Usaremos **XcodeGen**: un archivo de texto `ios/project.yml` que describe el proyecto y genera el `.xcodeproj` en cualquier Mac con un comando.
  2. **GitHub Actions** compila la app en macOS, pasa los tests y genera **capturas de pantalla del simulador** para que revises el diseño desde este PC. *(Hay que confirmar que la imagen de macOS de GitHub trae Xcode 26).*
  3. **El backend se desarrolla y prueba al 100 % en Windows** (`wrangler dev` + tests con Vitest).
- **Repositorio público:** el código se ve, pero las claves no. Viven en Cloudflare (`wrangler secret put`) y en GitHub Secrets, y el archivo local de claves está en `.gitignore`.
- **Sin cuenta de pago de Apple:** lo más probable es que los **App Groups** (para que la Share Extension guarde en los Guardados de la app) no estén disponibles, así que la extensión se diseña para funcionar sola (ver §9).

---

## 4. Estructura del repositorio

```
APP/                                  ← repositorio git propio, público en GitHub
├── ios/                              ← app de iPhone
├── backend/                          ← Cloudflare Worker
├── docs/
│   └── ARQUITECTURA.md               ← este documento
├── .github/workflows/
│   ├── backend.yml                   ← tests del backend (Linux)
│   └── ios.yml                       ← compilación + tests + capturas (macOS)
├── .gitignore                        ← incluye .dev.vars y Secretos.xcconfig
└── README.md
```

## 5. Estructura de la app iOS

```
ios/
├── project.yml                         # XcodeGen: targets, capacidades, Info.plist (el .xcodeproj no se versiona)
├── Config/
│   ├── Base.xcconfig
│   └── Secretos.xcconfig.example       # URL del backend + clave de la app (el real no se sube)
│
├── DupeFinder/                         # ── Target principal ──
│   ├── App/
│   │   ├── DupeFinderApp.swift         # @main, ModelContainer de SwiftData, inyección de dependencias
│   │   ├── PestanasRaiz.swift          # TabView nativo: Buscar · Outfits · Guardados
│   │   └── Dependencias.swift          # contenedor @Observable con los servicios (remotos o simulados)
│   │
│   ├── Funciones/
│   │   ├── Buscar/
│   │   │   ├── BuscarView.swift              # inicio: un único botón grande de vidrio "Buscar prenda"
│   │   │   ├── BuscarViewModel.swift
│   │   │   ├── MenuOrigen.swift              # Cámara / Fotos / Pegar enlace (GlassEffectContainer + morph)
│   │   │   ├── SugerenciaPortapapeles.swift  # "Tienes un enlace copiado" + PasteButton
│   │   │   ├── CamaraView.swift              # envoltorio UIKit (imprescindible: SwiftUI no tiene cámara)
│   │   │   └── Ficha/
│   │   │       ├── FichaSheet.swift          # hoja de vidrio con la ficha técnica
│   │   │       ├── FichaViewModel.swift
│   │   │       └── ChipEditable.swift
│   │   ├── Resultados/
│   │   │   ├── ResultadosView.swift
│   │   │   ├── ResultadosViewModel.swift
│   │   │   ├── SelectorRango.swift           # selector segmentado de vidrio
│   │   │   ├── TarjetaAlternativa.swift      # foto limpia, tienda, precio, % y 2–3 etiquetas
│   │   │   ├── DetalleAlternativaView.swift  # "Ver en tienda" + "Guardar"
│   │   │   └── NavegadorTienda.swift         # SFSafariViewController (UIKit imprescindible)
│   │   ├── Outfits/
│   │   │   ├── OutfitsView.swift
│   │   │   ├── OutfitsViewModel.swift
│   │   │   ├── SelectorEstilo.swift          # chips + campo libre
│   │   │   ├── SelectorPresupuesto.swift
│   │   │   ├── CarruselOutfits.swift         # carrusel horizontal
│   │   │   ├── CollageOutfit.swift
│   │   │   └── CambiarPiezaSheet.swift       # mantener pulsado → "Cambiar esta prenda"
│   │   └── Guardados/
│   │       ├── GuardadosView.swift
│   │       └── GuardadosViewModel.swift
│   │
│   ├── Persistencia/                   # modelos SwiftData (@Model)
│   │   ├── PrendaGuardada.swift
│   │   ├── OutfitGuardado.swift
│   │   └── PiezaGuardada.swift
│   │
│   └── Recursos/
│       ├── Assets.xcassets             # icono + un único color de acento
│       ├── Localizable.xcstrings       # textos en español (preparado para traducir)
│       └── Simulados/                  # JSON de prueba (fase 1 y previews de Xcode)
│           ├── ficha.json
│           ├── busqueda.json
│           └── outfits.json
│
├── DupeFinderShare/                    # ── Share Extension (fase 6) ──
│   ├── ShareViewController.swift       # controlador UIKit mínimo que aloja la vista SwiftUI (obligatorio)
│   ├── LectorCompartido.swift          # lee los adjuntos: página de Safari, foto, enlace o texto
│   ├── Preprocesado.js                 # desde Safari: envía la cabecera y el JSON-LD de la página ya abierta
│   └── Info.plist                      # lo genera XcodeGen (no se sube)
│
├── Paquetes/DupeKit/                   # ── Paquete Swift local, compartido por app y extensión ──
│   ├── Package.swift
│   ├── Sources/
│   │   ├── DupeNucleo/                 # solo Foundation (sin SwiftUI): se puede testear hasta en Linux
│   │   │   ├── Modelos/
│   │   │   │   ├── FichaPrenda.swift
│   │   │   │   ├── Producto.swift
│   │   │   │   ├── Precio.swift
│   │   │   │   ├── RangoPrecio.swift
│   │   │   │   ├── Alternativa.swift
│   │   │   │   ├── Similitud.swift
│   │   │   │   ├── Outfit.swift
│   │   │   │   ├── PerfilEstilo.swift
│   │   │   │   ├── DatosPagina.swift   # lo que se extrae de la página de un producto
│   │   │   │   ├── EstadoCarga.swift
│   │   │   │   └── ErrorApp.swift      # errores con mensaje amable en español
│   │   │   ├── Paginas/
│   │   │   │   └── ExtractorPagina.swift   # descarga la página en el iPhone y lee JSON-LD Product + og:*
│   │   │   └── Red/
│   │   │       ├── ClienteAPI.swift    # URLSession + async/await, decodificación snake_case
│   │   │       ├── Endpoints.swift
│   │   │       ├── IdentificadorInstalacion.swift  # UUID anónimo en el Llavero (para el límite de peticiones)
│   │   │       ├── ServicioAnalisis.swift    # protocolo + versión remota + versión simulada
│   │   │       ├── ServicioBusqueda.swift
│   │   │       └── ServicioOutfits.swift
│   │   └── DupeDiseno/                 # sistema de diseño SwiftUI
│   │       ├── Tema.swift              # acento, espaciados, radios
│   │       ├── BotonCristalGrande.swift
│   │       ├── Chip.swift
│   │       ├── ImagenRemota.swift      # carga asíncrona con caché + placeholder sutil (sin spinners)
│   │       ├── CacheImagenes.swift     # actor: memoria (NSCache) + disco (URLCache)
│   │       ├── PreparadorFoto.swift    # reduce la foto a ~1024 px JPEG antes de enviarla
│   │       └── Formatos.swift          # 12,99 € (es_ES)
│   └── Tests/DupeNucleoTests/          # decodificar JSON, extraer páginas de ejemplo, precios, rangos
│
├── DupeFinderTests/                    # tests de ViewModels con servicios simulados
└── DupeFinderUITests/                  # recorridos básicos + capturas de pantalla para revisar en CI
```

**Estado tras la fase 1** (lo construido difiere un poco del árbol de arriba):
- Los JSON de prueba están en el paquete (`DupeNucleo/Simulados/`), no en la app: así los comparten la app, las previews y los tests. `analisis-foto.json` es la respuesta real de Gemini con la foto de prueba.
- `DupeDiseno` contiene `Tema` (espaciados, `Color(hex:)`), `Chip`, `FlujoChips` (chips que saltan de línea) y `EtiquetaOpcion`. El botón principal con morph vive en `BuscarView`.
- `ImagenRemota` y `CacheImagenes` llegan con los resultados (fase 3).
- La app usa aislamiento por defecto en el hilo principal (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`); el paquete no.
- La app acepta `-captura inicio|menu|ficha|outfits|guardados` al arrancar: lo usa la CI para hacer capturas.

**Estado tras la fase 2 (conexión con el backend):**
- `DupeNucleo/Red/`: `ClienteAPI` (foto en multipart, página en JSON, errores traducidos a `ErrorApp`), `ConfiguracionAPI` (lee `URL_BACKEND` y `CLAVE_APP` del Info.plist) e `IdentificadorInstalacion` (UUID en el Llavero).
- `DupeNucleo/Paginas/`: `ExtractorPagina` (JSON-LD Product y etiquetas og/product) y `LectorPaginasHTTP`.
- En la app, `LectorPaginasCompleto`: primero descarga normal; si la tienda responde con una verificación anti-bots, abre la página en un `WKWebView` invisible y lee el HTML cuando aparecen los datos del producto. **Comprobado:** Zara (Akamai) y Mango (Vercel) bloquean las descargas directas incluso desde una conexión doméstica.
- `ServicioAnalisisRemoto` une las dos piezas. Si no hay `Secretos.xcconfig`, la app usa `ServicioAnalisisSimulado` y muestra "Modo de prueba".
- Sin verificar todavía en un iPhone real: que el navegador invisible supere las verificaciones de Zara y Mango.

**Estado tras la fase 3 (búsqueda y resultados):**
- Backend `POST /v1/buscar`: Google Lens con la imagen y, solo si da menos de 6 resultados válidos, Google Shopping con la primera palabra clave (siempre con "hombre"). Filtra tiendas activas de la lista blanca, ropa de hombre y precios en euros; quita duplicados; Lens va primero. Caché de 24 h (1 h si no hay resultados).
- **Limitación de Google Shopping:** SerpAPI no da la URL de la tienda, solo un enlace a Google Shopping y el nombre del vendedor. Se filtra por ese nombre (con `alias` en `tiendas.json`) y "Ver en tienda" abre Google Shopping, que enlaza a la tienda. Pedir la URL directa costaría una consulta más por producto.
- **Verificado con datos reales (22/10/2026)** con la foto de los vaqueros: Google Lens devolvió 59 coincidencias (17 con precio, en forma `{ value: "70 €*", extracted_value: 70, currency: "€" }`, y a veces `in_stock`); Google Shopping, 40 resultados con `link` vacío (se usa `product_link`) y 5 de segunda mano (`second_hand_condition`, se descartan). Resultado final: 17 alternativas con 2 consultas. Esas respuestas están guardadas en `backend/test/fixtures/` para los tests.
- **Pendiente de decidir:** Lens encontró 7 prendas de hombre de tiendas de la lista (Bershka, ASOS, Zalando) **sin precio**, y la especificación dice descartarlas. Se podrían mostrar con "Ver precio en la tienda".
- Google Lens no puede leer imágenes de un backend en `localhost`: en local solo se busca por texto.
- `similitud` y `etiquetas` llegan vacías hasta la fase 4.
- App: `ResultadosView` (2 columnas, selector de rango segmentado nativo en una `safeAreaBar`), `TarjetaAlternativa`, `DetalleAlternativaView` (Ver en tienda con `SFSafariViewController` y Guardar en SwiftData), `ImagenRemota` + `CacheImagenes` en `DupeDiseno`. El selector incluye "Todo" además de los cuatro rangos.

**Estado tras la fase 4 (similitud y etiquetas):**
- Tras buscar, `evaluarAlternativas` descarga la foto original y las miniaturas (3–16 KB), y lanza a la vez dos peticiones a Gemini:
  1. **Embeddings** (`gemini-embedding-2`, 256 dimensiones, todas las imágenes en una petición) → coseno → 0–100. Calibrado con fotos reales: casi iguales ≈ 0,85; misma prenda en otro color ≈ 0,70; otra prenda ≈ 0,60 (`COSENO_MINIMO` 0,55, `COSENO_MAXIMO` 0,90).
  2. **Atributos** de cada candidata (color, fibras, gramaje, fit, detalles de la original que tiene y si es el mismo tipo de prenda), con un esquema JSON cuyos detalles son la lista de la ficha original.
- Puntuación en código: color con CIEDE2000 (ΔE 2 → 100, ΔE 12 → 70, ΔE 35 → 0), gramaje y fit por cercanía, material por fibra principal, detalles por proporción. Pesos 35/20/15/10/10/10; los que faltan se reparten. Otro tipo de prenda puntúa la mitad.
- Etiquetas (máx. 3): otro tipo de prenda › color › gramaje › corte › detalle compartido › material.
- **Comprobado con datos reales:** 17 alternativas puntuadas en ~9 s; los vaqueros oscuros y anchos quedan arriba (83–91 %), los de otro color en medio (≈ 50 %) y una bermuda vaquera al final (25 %, "Otro tipo de prenda").
- La IA puede variar un poco entre ejecuciones (p. ej. si estima o no el gramaje); como la búsqueda se guarda 24 h, el usuario ve siempre lo mismo.
- Si la IA falla, la búsqueda se devuelve igualmente (con lo que haya, o sin similitud).
- **Solo hombre, también por la foto:** la IA indica para quién es cada candidata y se descartan las de mujer que la URL y el título no delatan (p. ej. unos "Jeans barrel tiro bajo" de Pull&Bear con modelo femenina). Salvaguarda: si el título o la URL dicen "hombre"/"men", la prenda se queda aunque la IA diga lo contrario (con datos reales la IA marcó por error unos "Calvin Klein Hombres Baggy Jeans").

**Estado tras la fase 5 (outfits):**
- Backend `POST /v1/outfits` responde **por líneas (NDJSON)**: `{"tipo":"progreso",…}` en cada paso y, al final, `{"tipo":"resultado","datos":…}` o `{"tipo":"error",…}`. Los errores antes de empezar (clave, petición no válida) siguen siendo JSON normal.
  1. Referencias: Google Images con "outfit {estilo} hombre" (8 miniaturas) → Gemini → `PerfilEstilo` (resumen, prendas típicas, paleta, siluetas, calzado). Caché de **30 días por estilo**.
  2. Plan: Gemini diseña 3 outfits con 2–4 piezas más la prenda base (nunca otra pieza con su mismo papel), con como mucho **6 búsquedas distintas**.
  3. Piezas: Google Shopping con `max_price` (presupuesto por prenda), lista blanca, solo hombre, euros, sin segunda mano. Caché de 24 h por búsqueda. Si una pieza no aparece, se reutiliza una del mismo tipo encontrada para otro outfit; un outfit con menos de 2 piezas nuevas se descarta.
- `POST /v1/outfits/cambiar-pieza`: otras opciones para una pieza desde la caché de su búsqueda (no gasta consultas).
- Shopping e Images usan `json_restrictor` para recibir solo los campos necesarios (las respuestas completas de Shopping pesan ~400 KB).
- **Probado con datos reales** ("old money", 60 € por prenda): 7 consultas la primera vez y 108 s (60 s analizando 12 referencias; ahora son 8); con el estilo en caché, 4 consultas y ~60 s. Ejemplo: camisa de lino Massimo Dutti 49,95 € + tus vaqueros + mocasines Pier One + cinturón trenzado de El Corte Inglés = 134,93 €.
- **Arreglo del contrato:** Swift omite las claves con valor nil al enviar JSON; las peticiones (`/v1/buscar`, `/v1/outfits`) ahora aceptan esas claves ausentes como null.
- App: pestaña Outfits (tu prenda, chips de estilo o uno escrito, máximo por prenda, progreso en directo, carrusel de collages), "Cambiar esta prenda" al mantener pulsada una pieza, guardar outfits, "Crear outfits" desde la ficha y desde el detalle. `EstadoCompartido` guarda la pestaña activa y la prenda base.

**Estado tras la fase 6 (extensión, guardados y pulido):**
- **Share Extension "Dupe Finder"** (`DupeFinderShare`, bundle `com.beeltraan25.dupefinder.share`, va dentro de la app). Acepta una página de Safari, una foto, un enlace o un texto con enlace. Desde Safari, `Preprocesado.js` envía la cabecera y el JSON-LD de la página **ya cargada**, así que no hay bloqueos anti-bots; si la página no tiene datos de producto, se lee el enlace como en la app.
- La extensión analiza y busca sin pasos intermedios (sin ficha editable) y muestra las **8 mejores alternativas**; al tocar una se abre la tienda. Sin App Groups (cuenta gratuita) no puede guardar en la app: lo dice en una nota.
- Su lógica y su vista están en el módulo **`DupeCompartir`** del paquete (con tests), y la app la muestra en la captura `compartir`, porque el simulador no puede abrir la hoja de compartir desde un script. `NavegadorTienda` y `PreparadorFoto` pasan a `DupeDiseno`.
- **Guardados:** al tocar un outfit se abre su detalle: estilo, por qué encaja, total y cada pieza con enlace a su tienda.
- **Pulido:** icono propio (lupa con "≈" sobre el azul de la app), se respeta "Reducir movimiento" (el menú de origen usa un fundido en vez del rebote y el desplazamiento a los outfits no se anima) y CI hace capturas con el texto de accesibilidad más grande (`grande-*.png`).
- **Sin probar en un iPhone real:** la hoja de compartir de Safari, Instagram y Fotos solo se puede comprobar en un dispositivo.

**Versión web (alternativa gratuita a instalar la app sin Mac):**
- `web/`: HTML, CSS y JavaScript sin dependencias ni compilación. El Worker la sirve como *static assets* en la misma dirección que la API (`assets.directory: ../web`), así que no hay CORS.
- Mismas pantallas que la app: buscar (foto con la cámara o la fototeca, o enlace), ficha editable, alternativas con rangos de precio y detalle, outfits (NDJSON en directo, cambiar pieza, guardar) y guardados en `localStorage`.
- La clave de la app la pega el usuario una vez (o `#clave=` en la dirección); nunca va en el código público. Sin clave, modo de prueba con `web/demo/`.
- Enlaces: la web no puede leer otras webs, así que `/v1/analizar` con solo `{url}` descarga la página en el servidor y, si la tienda lo bloquea, prueba con Jina Reader (gratis, sin clave). Comprobado: Zalando sí; Zara y H&M no (la web pide una captura).
- Se añade a la pantalla de inicio (`manifest.webmanifest`, `apple-touch-icon`). Sin Share Extension ni diseño nativo.

**Más precisión (color estricto e identificar la prenda de la foto):**
- **Solo el mismo color:** la IA marca para cada candidata `mismo_color` (estricta: otro tono es otro color) y se quitan las demás. La respuesta de `/v1/buscar` lleva `descartadas_por_color`. Prueba real con tus vaqueros: 23 candidatas → 7 azul oscuro/índigo.
- **Shopping siempre**, con el color en la consulta, y con hueco reservado (Lens como mucho 16 de 24): así hay más candidatas del color correcto. Una consulta más de SerpAPI por búsqueda.
- **Identificar la prenda:** al analizar una foto se pasa por Google Lens (guardado 24 h; la búsqueda lo reutiliza, así que no cuesta una consulta extra). La IA ve los 10 primeros títulos: los usa para afinar la ficha y, si uno es exactamente esa prenda en una tienda conocida, se lee su página (directa o Jina Reader) y se completa la ficha con sus datos reales (material, composición, precio), manteniendo el color de la foto. La foto se guarda antes de analizarla porque Lens necesita leerla. Un resultado vacío de Lens no se guarda en caché (justo después de subir la foto, a veces aún no la ve).
- Caché `v2`: los análisis y búsquedas antiguos se recalculan.

**Más opciones (colores agrupados e inspiración de Pinterest):**
- El color ya no filtra: cada alternativa lleva `mismo_color` y se ordenan primero las de tu color y después las de otros colores (`de_otro_color` en la respuesta). La web las muestra en dos secciones.
- Hasta 30 alternativas por búsqueda (18 de Lens como mucho): es lo que cabe en el límite gratuito de Cloudflare de 50 descargas por petición.
- `POST /v1/inspiracion` { ficha, excluir }: Google Images con `site:pinterest.com` → la IA ve 8 referencias y describe el «rollo» y 2–4 ideas de prendas del mismo tipo (al menos una de otro color) → Google Shopping por idea (`buscarPieza`, tiendas de la lista blanca). Unas 4 consultas de SerpAPI, por eso va en un botón aparte («Ver ideas de Pinterest»); se guarda 24 h por prenda. Prueba real con tus vaqueros: 39 s, 12 referencias y 3 ideas con 8 prendas cada una.

**Más parecidas e historial de fotos:**
- La IA puntúa cada candidata con `parecido` (0–100): forma, corte, tejido y detalles **sin contar el color**. Se quitan las que se parecen poco (`sePareceLoSuficiente`): del mismo color, por debajo de 35; de otro color, hace falta parecido ≥ 70, ser el mismo tipo de prenda, el mismo corte, un grosor parecido y una «forma» (grosor, material, corte y detalles, sin la foto) ≥ 70. Las candidatas que la IA no devuelve solo se enseñan si la foto se parece (visual ≥ 50).
- Las miniaturas de Google Shopping vienen siempre en WebP y los embeddings de imagen solo admiten JPEG/PNG: se piden convertidas a JPEG con wsrv.nl (gratis, sin clave; si falla, la original). Antes la puntuación visual faltaba en casi todas.
- Ideas de Pinterest: la búsqueda usa la misma frase que la de tiendas, la IA de estilista ve primero la foto original (manda sobre Pinterest) y después cada producto de las ideas se compara con la prenda con exigencia `EXIGENCIA_IDEAS` (más estricta). `POST /v1/inspiracion` acepta `imagen_url`. Prueba real con los vaqueros carpintero: 36 s, 4 de 22 descartadas, ideas «Carpintero en lavado claro» y «Denim ancho negro».
- Caché `v3`.
- **Historial «Tus fotos»** (solo en el dispositivo): cada análisis (foto o enlace) se guarda sin repetir (SHA-256 de la foto o la URL del producto), hasta 60. App: modelo SwiftData `PrendaBuscada` (foto en almacenamiento externo + miniatura de 300 px), tira en Inicio y en Guardados y pantalla `HistorialView`. Web: IndexedDB (`js/historial.js`). Al tocar una se abre su ficha; si la foto tiene más de 23 h, se vuelve a analizar porque el servidor ya la ha borrado (Google Lens la necesita).

**Notas de diseño que afectan a la estructura**

- **Servicios con versión simulada:** cada servicio es un protocolo con dos implementaciones (`…Remoto` y `…Simulado`). La fase 1 funciona entera con los JSON de `Simulados/` y, en la fase 2, basta con cambiar a la versión remota. Además, las pruebas de diseño no gastan cuota gratuita.
- **Liquid Glass solo en la capa de controles:** `BotonCristalGrande`, `MenuOrigen` y `SelectorRango` usan `.glassEffect()`, `GlassEffectContainer`, `.glassEffectID` y `.buttonStyle(.glass/.glassProminent)`. `TarjetaAlternativa` y `CollageOutfit` nunca llevan vidrio. TabView y toolbars son los nativos.
- **Portapapeles sin avisos molestos:** `UIPasteboard.detectPatterns(for: [.probableWebURL])` sabe si hay un enlace **sin** mostrar el aviso de privacidad de iOS; el contenido solo se lee cuando el usuario toca un `PasteButton`.
- **UIKit solo donde es imprescindible:** cámara, `SFSafariViewController` y el controlador principal de la Share Extension.
- **Hápticos:** con el modificador nativo `.sensoryFeedback` (sin código UIKit).
- **Accesibilidad:** Dynamic Type en todo (comprobado en CI con el tamaño más grande), etiquetas de VoiceOver en tarjetas y filas, "Reducir movimiento" respetado en las animaciones propias. "Reducir transparencia" lo aplica el sistema: el vidrio nativo se vuelve opaco solo.

---

## 6. Estructura del backend

```
backend/
├── package.json
├── wrangler.jsonc                  # bindings: KV (CACHE, IMAGENES), límite de peticiones, variables
├── tsconfig.json
├── vitest.config.ts
├── .dev.vars.example               # GEMINI_API_KEY= SERPAPI_KEY= CLAVE_APP=  (el .dev.vars real nunca se sube)
├── config/
│   └── tiendas.json                # lista blanca de tiendas (editable sin tocar código)
├── src/                            # ✅ = ya construido (fase 2) · el resto llega en fases 3–5
│   ├── index.ts                    # ✅ app Hono: rutas + gestión de errores
│   ├── entorno.ts                  # ✅ tipos de los bindings y secretos
│   ├── rutas/
│   │   ├── analizar.ts             # ✅ POST /v1/analizar (foto o página)
│   │   ├── imagenes.ts             # ✅ GET  /v1/imagenes/:id  (sirve la foto temporal a Google Lens)
│   │   ├── tiendas.ts              # ✅ GET  /v1/tiendas
│   │   ├── buscar.ts               #    POST /v1/buscar
│   │   └── outfits.ts              #    POST /v1/outfits · POST /v1/outfits/cambiar-pieza
│   ├── esquemas/                   # Zod = contrato de la API (fuente de verdad única)
│   │   ├── ficha.ts                # ✅ FichaIA (lo que responde la IA) y FichaPrenda (lo que recibe la app)
│   │   ├── pagina.ts               # ✅ DatosPagina
│   │   ├── producto.ts             # ✅ Precio, Tienda, Producto, ProductoOrigen
│   │   ├── analisis.ts             # ✅ RespuestaAnalisis
│   │   ├── busqueda.ts
│   │   └── outfit.ts
│   ├── ia/
│   │   ├── proveedor.ts            # ✅ interfaz ProveedorIA (intercambiable)
│   │   ├── gemini.ts               # ✅ API Interactions por REST; si un modelo agota la cuota, pasa al siguiente
│   │   └── prompts.ts              # ✅
│   ├── analisis/
│   │   ├── fichaDesdeFoto.ts       # ✅ foto → Gemini visión → ficha
│   │   ├── fichaDesdePagina.ts     # ✅ datos de la página + su imagen → ficha
│   │   ├── productoDesdePagina.ts  # ✅ prenda original: tienda, marca, precio en € y rango
│   │   ├── jsonLd.ts               # ✅ busca el Product de schema.org (también en @graph y variantes)
│   │   └── normalizar.ts           # ✅ colores, gsm → ligero/medio/pesado, campos estimados, solo hombre
│   ├── busqueda/
│   │   ├── listaBlanca.ts          # ✅ ¿la URL pertenece a una tienda permitida?
│   │   ├── precios.ts              # ✅ "1.299,00 €" → 129900 céntimos; rangos; formato español
│   │   ├── serpapi.ts              #    google_lens · google_shopping · google_images (country/gl "es", hl "es")
│   │   ├── deduplicar.ts           #    mismo producto visto por Lens y por Shopping
│   │   └── buscarAlternativas.ts   #    Lens primero; Shopping solo si hay pocos resultados válidos
│   ├── similitud/
│   │   ├── puntuar.ts              #    pesos + redistribución cuando falta un dato
│   │   ├── visual.ts               #    gemini-embedding-2 → similitud de coseno
│   │   ├── color.ts                #    hex → Lab, Delta E 2000
│   │   ├── atributos.ts            #    material, fit, detalles, gramaje
│   │   └── etiquetas.ts            #    "Mismo color", "Tejido más ligero"…
│   ├── outfits/
│   │   ├── referencias.ts          #    Google Images vía SerpAPI (Pinterest opcional si algún día hay acceso)
│   │   ├── perfilEstilo.ts         #    Gemini analiza 10–20 referencias (resultado cacheado 30 días)
│   │   └── generarOutfits.ts       #    3 outfits + búsqueda de cada pieza dentro del presupuesto
│   └── infra/
│       ├── cache.ts                # ✅ KV, TTL 24 h; si KV falla, la petición sigue
│       ├── imagenes.ts             # ✅ detectar formato, guardar la foto 24 h, descargar imágenes de tiendas
│       ├── seguridad.ts            # ✅ clave de la app + límite por instalación (protege tus cuotas gratuitas)
│       ├── errores.ts              # ✅ códigos de error + mensajes en español
│       └── utilidades.ts           # ✅ huellas SHA-256, base64, limpieza de URLs
└── test/                           # ✅ 71 tests con IA y KV simulados (no gastan cuota)
```

**Lista blanca (`config/tiendas.json`)** — se compara por dominio, no por nombre:

```json
[
  { "id": "zara",    "nombre": "Zara",    "grupo": "Inditex", "dominios": ["zara.com"],      "activa": true },
  { "id": "oysho",   "nombre": "Oysho",   "grupo": "Inditex", "dominios": ["oysho.com"],     "activa": false },
  { "id": "mango",   "nombre": "Mango",   "grupo": "Mango",   "dominios": ["mango.com", "shop.mango.com"], "activa": true },
  { "id": "zalando", "nombre": "Zalando", "multimarca": true, "dominios": ["zalando.es"],    "activa": true }
]
```
(Están todas las tiendas de tu lista.) `activa: false` deja una tienda en la lista sin usarla. Como la app es solo de hombre, empiezan desactivadas **Oysho** y **& Other Stories**, que venden casi solo ropa de mujer. En la fase 3 se comprueba con búsquedas reales qué otras tiendas aportan resultados de hombre.

**Solo hombre:** la ficha siempre sale con `publico: "hombre"`, las búsquedas añaden "hombre" y se descartan los resultados de secciones de mujer (por la URL o el título).

---

## 7. Contrato de la API

Cabeceras en todas las peticiones de la app:
- `X-Instalacion-Id`: UUID anónimo, sin registro, para el límite de peticiones.
- `X-Clave-App`: clave privada compartida entre tu app y tu backend. Como el repositorio es público, impide que otros usen tu backend y agoten tus cuotas gratuitas. No se sube a GitHub.

| Método | Ruta | Entrada | Salida |
|---|---|---|---|
| POST | `/v1/analizar` | `multipart` con `imagen` **o** JSON `{ "pagina": DatosPagina }` | `RespuestaAnalisis` |
| GET | `/v1/imagenes/:id` | — (público, id aleatorio, caduca en 24 h) | la foto, para Google Lens |
| POST | `/v1/buscar` | `{ "imagen_url"?, "ficha" }` | `RespuestaBusqueda` (todos los rangos de una vez) |
| POST | `/v1/outfits` | `{ "prenda_base", "estilo", "presupuesto" }` | `RespuestaOutfits` (en streaming, con pasos de progreso) |
| POST | `/v1/outfits/cambiar-pieza` | `{ "outfit", "pieza_id", "estilo", "presupuesto" }` | `{ "opciones": [Producto] }` |
| GET | `/v1/tiendas` | — | lista blanca |

Errores, siempre con el mismo formato:

```json
{ "error": { "codigo": "PRENDA_NO_DETECTADA",
             "mensaje": "No hemos encontrado ninguna prenda en la foto. Prueba con una en la que se vea entera." } }
```

Ejemplo de error de cuota: `CUOTA_AGOTADA` → *"Hemos llegado al límite de búsquedas gratuitas de hoy. Vuelve a intentarlo mañana."*

---

## 8. Modelos de datos

### 8.1 JSON (fuente de verdad: esquemas Zod del backend)

**DatosPagina** — lo que el iPhone (o la Share Extension desde Safari) extrae de un enlace:

```jsonc
{
  "url": "https://www.zara.com/es/es/sudadera-…html",
  "titulo": "SUDADERA CAPUCHA HEAVYWEIGHT",          // og:title o JSON-LD name
  "imagen_url": "https://static.zara.net/…jpg",      // og:image o JSON-LD image
  "precio_texto": "29,95 EUR",                       // tal cual aparece; el backend lo normaliza
  "descripcion": "Sudadera de cuello con capucha…",
  "json_ld": { /* objeto Product completo si existe, o null */ }
}
```

**FichaPrenda** — tu especificación, con 3 añadidos marcados con ★:

```jsonc
{
  "categoria": "sudadera",
  "subcategoria": "oversize con capucha",
  "color_principal": { "nombre": "gris marengo", "hex": "#4A4A4A" },
  "colores_secundarios": [],
  "estampado": "liso",
  "material": "algodón 100%",
  "composicion": [{ "fibra": "algodón", "porcentaje": 100 }],   // ★ estructurada, para puntuar material
  "gramaje_gsm": 380,                  // null si no se conoce
  "gramaje_estimado": "pesado",        // ligero (<180) | medio (180–300) | pesado (>300)
  "fit": "oversize",                   // ajustado | regular | relajado | oversize | otro
  "largo": "regular",
  "cuello": "capucha",
  "mangas": "largas",
  "cierres": "ninguno",
  "detalles": ["hombros caídos", "bolsillo canguro"],
  "acabado": "cepillado",
  "publico": "hombre",                 // ★ hombre | mujer | unisex — por ahora siempre "hombre"
  "palabras_clave_busqueda": ["sudadera oversize gris pesada", "heavyweight hoodie grey"],
  "campos_estimados": ["gramaje_gsm", "material"]   // ★ qué datos ha deducido la IA (se marcan en la UI)
}
```

**RespuestaAnalisis**

```jsonc
{
  "analisis_id": "an_7Kq2…",
  "imagen_url": "https://…workers.dev/v1/imagenes/an_7Kq2",  // foto en KV (24 h) u og:image de la tienda; null si no hay
  "producto_origen": { /* Producto */ },                       // solo si la entrada era un enlace; su precio y rango pueden ser null
  "ficha": { /* FichaPrenda */ }
}
```

**Producto** — sirve para la prenda original, las alternativas y las piezas de un outfit:

```jsonc
{
  "id": "prd_9f3a…",                          // hash de la URL canónica
  "titulo": "Sudadera capucha heavyweight",
  "tienda": { "id": "zalando", "nombre": "Zalando" },
  "marca": "Carhartt WIP",                    // puede ser distinta de la tienda (multimarca)
  "url": "https://www.zalando.es/…",
  "imagen_url": "https://…",
  "precio": { "centimos": 2995, "moneda": "EUR" },   // céntimos enteros: sin errores de redondeo
  "precio_anterior": null,                    // si está rebajado
  "rango": "medio"                            // economico | medio | alto | premium
}
```

**Alternativa** y **Similitud**

```jsonc
{
  "producto": { /* Producto */ },
  "similitud": {
    "total": 87,
    "criterios": [
      { "criterio": "visual",   "peso_base": 0.35, "peso_aplicado": 0.41, "puntuacion": 92,   "disponible": true  },
      { "criterio": "color",    "peso_base": 0.20, "peso_aplicado": 0.24, "puntuacion": 95,   "disponible": true  },
      { "criterio": "gramaje",  "peso_base": 0.15, "peso_aplicado": 0,    "puntuacion": null, "disponible": false },
      { "criterio": "material", "peso_base": 0.10, "peso_aplicado": 0.12, "puntuacion": 80,   "disponible": true  },
      { "criterio": "fit",      "peso_base": 0.10, "peso_aplicado": 0.12, "puntuacion": 70,   "disponible": true  },
      { "criterio": "detalles", "peso_base": 0.10, "peso_aplicado": 0.11, "puntuacion": 60,   "disponible": true  }
    ]
  },
  "etiquetas": [
    { "texto": "Mismo color",        "tipo": "coincide" },
    { "texto": "Tejido más ligero",  "tipo": "diferencia" }
  ],
  "fuente": "lens"                    // lens | shopping
}
```

**RespuestaBusqueda** — devuelve todos los rangos a la vez, así el selector cambia al instante sin otra petición (y sin gastar cuota):

```jsonc
{
  "busqueda_id": "bs_…",
  "alternativas": [ /* Alternativa, ordenadas por similitud */ ],
  "conteo_por_rango": { "economico": 4, "medio": 7, "alto": 3, "premium": 0 },
  "desde_cache": false
}
```

**Outfits**

```jsonc
// Petición
{
  "prenda_base": { "ficha": { /* FichaPrenda */ }, "producto": { /* Producto o null */ } },
  "estilo": "old money",
  "presupuesto": { "maximo_por_prenda_centimos": 6000 }   // por prenda; null = sin límite
}

// Respuesta
{
  "perfil_estilo": {
    "estilo": "old money",
    "prendas_tipicas": [{ "rol": "superior", "descripcion": "polo de punto fino" }],
    "paleta": [{ "nombre": "beige", "hex": "#D8C8B0" }],
    "siluetas": ["recta", "entallada"],
    "calzado": ["mocasines", "náuticos"]
  },
  "outfits": [
    {
      "id": "out_1",
      "por_que_encaja": "Paleta neutra y punto fino: equilibra el volumen de la sudadera.",
      "precio_total": { "centimos": 18990, "moneda": "EUR" },
      "piezas": [
        { "id": "pz_1", "rol": "superior", "es_prenda_base": true,  "producto": { /* Producto */ } },
        { "id": "pz_2", "rol": "inferior", "es_prenda_base": false, "producto": { /* Producto */ } },
        { "id": "pz_3", "rol": "calzado",  "es_prenda_base": false, "producto": { /* Producto */ } }
      ]
    }
  ]
}
```
`rol`: superior · inferior · vestido · abrigo · calzado · bolso · accesorio.

### 8.2 Swift (paquete `DupeNucleo`)

```swift
public struct DatosPagina: Codable, Hashable, Sendable {
    public var url: URL
    public var titulo: String?
    public var imagenUrl: URL?
    public var precioTexto: String?
    public var descripcion: String?
    public var jsonLd: [String: ValorJSON]?        // ValorJSON: enum Codable para JSON arbitrario
}

public struct FichaPrenda: Codable, Hashable, Sendable {
    public var categoria: String
    public var subcategoria: String?
    public var colorPrincipal: ColorPrenda
    public var coloresSecundarios: [ColorPrenda]
    public var estampado: String
    public var material: String?
    public var composicion: [Fibra]
    public var gramajeGsm: Int?
    public var gramajeEstimado: GramajeEstimado?
    public var fit: Fit?
    public var largo: String?
    public var cuello: String?
    public var mangas: String?
    public var cierres: String?
    public var detalles: [String]
    public var acabado: String?
    public var publico: Publico?
    public var palabrasClaveBusqueda: [String]
    public var camposEstimados: [String]
}

public struct ColorPrenda: Codable, Hashable, Sendable { public var nombre: String; public var hex: String }
public struct Fibra: Codable, Hashable, Sendable { public var fibra: String; public var porcentaje: Int }

public enum GramajeEstimado: String, Codable, Sendable { case ligero, medio, pesado }
public enum Fit: String, Codable, Sendable { case ajustado, regular, relajado, oversize, otro }
public enum Publico: String, Codable, Sendable { case hombre, mujer, unisex }
// Los enums decodifican cualquier valor desconocido como `.otro` / nil, para que un cambio del backend no rompa la app.

public struct Precio: Codable, Hashable, Comparable, Sendable {
    public var centimos: Int
    public var moneda: String                       // "EUR"
    public var formateado: String {                 // "12,99 €"
        (Decimal(centimos) / 100).formatted(.currency(code: moneda).locale(Locale(identifier: "es_ES")))
    }
}

public enum RangoPrecio: String, Codable, CaseIterable, Sendable {
    case economico, medio, alto, premium
    // < 25 € · 25–60 € · más de 60 hasta 150 € · más de 150 €
}

public struct Tienda: Codable, Hashable, Sendable { public var id: String; public var nombre: String }

public struct Producto: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var titulo: String
    public var tienda: Tienda
    public var marca: String?
    public var url: URL
    public var imagenUrl: URL?
    public var precio: Precio
    public var precioAnterior: Precio?
    public var rango: RangoPrecio
}

public struct Similitud: Codable, Hashable, Sendable {
    public var total: Int                           // 0–100
    public var criterios: [CriterioSimilitud]
}
public struct CriterioSimilitud: Codable, Hashable, Sendable {
    public var criterio: TipoCriterio               // visual, color, gramaje, material, fit, detalles
    public var pesoBase: Double
    public var pesoAplicado: Double
    public var puntuacion: Int?
    public var disponible: Bool
}

public struct Etiqueta: Codable, Hashable, Sendable {
    public enum Tipo: String, Codable, Sendable { case coincide, diferencia }
    public var texto: String
    public var tipo: Tipo
}

public struct Alternativa: Codable, Hashable, Identifiable, Sendable {
    public var id: String { producto.id }
    public var producto: Producto
    public var similitud: Similitud
    public var etiquetas: [Etiqueta]
    public var fuente: String
}

public struct Outfit: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var porQueEncaja: String
    public var precioTotal: Precio
    public var piezas: [PiezaOutfit]
}
public struct PiezaOutfit: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var rol: RolPieza
    public var esPrendaBase: Bool
    public var producto: Producto
}
public enum RolPieza: String, Codable, Sendable { case superior, inferior, vestido, abrigo, calzado, bolso, accesorio }

/// Estado que usan todos los ViewModels para pintar carga / resultado / error.
public enum EstadoCarga<Valor: Sendable>: Sendable {
    case inactivo, cargando, listo(Valor), error(ErrorApp)
}
```

### 8.3 SwiftData (guardados en local)

Se guarda una **copia** de los datos (no una referencia), para que los guardados se vean aunque el producto desaparezca de la tienda.

```swift
@Model final class PrendaGuardada {
    #Unique<PrendaGuardada>([\.productoId])
    var productoId: String
    var titulo: String
    var tiendaNombre: String
    var marca: String?
    var url: URL
    var imagenUrl: URL?
    var precioCentimos: Int
    var similitud: Int?
    var etiquetas: [String]
    var fichaOrigen: Data?          // FichaPrenda en JSON: para "buscar otra vez"
    var fechaGuardado: Date
}

@Model final class OutfitGuardado {
    var id: UUID
    var estilo: String
    var porQueEncaja: String
    var precioTotalCentimos: Int
    var fechaGuardado: Date
    @Relationship(deleteRule: .cascade, inverse: \PiezaGuardada.outfit)
    var piezas: [PiezaGuardada] = []
}

@Model final class PiezaGuardada {
    var orden: Int
    var rol: String
    var esPrendaBase: Bool
    var productoId: String
    var titulo: String
    var tiendaNombre: String
    var url: URL
    var imagenUrl: URL?
    var precioCentimos: Int
    var outfit: OutfitGuardado?
}
```

---

## 9. Riesgos y ajustes sobre la especificación

1. **Google Lens necesita una URL de imagen.** La foto de la cámara se guarda en KV con un id aleatorio y el backend la sirve en `/v1/imagenes/:id` durante 24 h.
2. **Las tiendas bloquean las descargas automáticas** (comprobado con Zara y Mango, incluso desde una conexión doméstica). Por eso la página la lee el iPhone con un navegador invisible, o la Share Extension directamente desde Safari, donde la página ya está cargada. Si aun así no hay datos, se analiza la `og:image` como una foto. Si tampoco funciona, la app pide amablemente una captura de pantalla.
3. **Pinterest:** la API oficial solo permite buscar en los pines del propio usuario, salvo acceso de partner. Usamos Google Images vía SerpAPI y dejamos Pinterest como proveedor opcional.
4. **Tienda ≠ marca:** Zalando, ASOS y El Corte Inglés venden otras marcas; la tarjeta muestra las dos.
5. **Similitud visual:** `gemini-embedding-2` compara la foto original con las miniaturas de las candidatas (como mucho 24 por búsqueda). Las miniaturas son pequeñas, así que el gasto de CPU es bajo. Plan B gratuito si hiciera falta: calcularla en el iPhone con el framework Vision de Apple (`GenerateImageFeaturePrintRequest`).
6. **Outfits tardan** (de 20 a 60 s, y el plan gratuito de Gemini a veces es lento). La respuesta irá en streaming con pasos de progreso ("Analizando el estilo…", "Buscando calzado…").
7. **Share Extension sin cuenta de pago:** la extensión llama ella misma al backend y muestra la ficha y las mejores alternativas. Solo "Guardar" depende de App Groups.
8. **Repositorio público:** las claves nunca se suben. La `X-Clave-App` y el límite por instalación protegen las cuotas gratuitas.

## 10. Plan de fases ajustado

| Fase | Contenido | ¿Se puede probar sin Mac? |
|---|---|---|
| **0** (nueva, corta) | Repositorio propio en `APP/`, estructura de carpetas, CI de GitHub Actions | Sí |
| **1** | App: 3 pestañas + inicio Liquid Glass con datos simulados | Compila en CI; revisión con capturas del simulador de CI |
| **2** | Backend: análisis de foto/página → ficha con Gemini. Conexión con la app | Backend sí; app con CI |
| **3** | Búsqueda + lista blanca + rangos + pantalla de resultados | Backend sí |
| **4** | Puntuación de similitud | Sí |
| **5** | Generador de outfits | Backend sí |
| **6** | Share Extension, Guardados, pulido visual y accesibilidad | Necesita Mac para probar de verdad |

**Recomendación:** fase 0 → fase 2 (backend) primero, porque se puede probar entera desde este PC, y la fase 1 de la app a continuación, revisándola con las capturas de CI.

**Cuentas que necesitarás (todas gratis, sin tarjeta):** Cloudflare, Google AI Studio (clave de Gemini), SerpAPI y GitHub. Te avisaré en la fase en la que haga falta cada una.

## 11. Decisiones tomadas sobre los puntos abiertos

1. **Ficha antes de buscar.** Flujo: *Buscar prenda* → origen (cámara, fotos o enlace) → hoja con la ficha → revisas o editas los chips → *Buscar alternativas*. La búsqueda **no** empieza hasta que confirmas, así que no se gastan consultas de SerpAPI en fichas que luego cambias. Se acepta pasar de 2 toques.
2. **Presupuesto de outfits por prenda.** Se elige con los mismos tramos de los resultados: *Hasta 25 €* · *Hasta 60 €* · *Hasta 150 €* · *Sin límite*. Se aplica a cada pieza que falta; la prenda base no cuenta.
3. **Solo ropa de hombre** por ahora (ver §6, lista blanca).
