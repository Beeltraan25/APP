// Dupe Finder (versión web): las mismas pantallas que la app de iPhone, en Safari.
import * as api from "./api.js";
import * as guardados from "./guardados.js";
import * as historial from "./historial.js";
import { abrirHoja, avisar, conMayuscula, euros, h, icono, imagen } from "./ui.js";

// --- Datos fijos (los mismos que la app) ---

const RANGOS = [
  { id: null, corto: "Todo" },
  { id: "economico", corto: "<25 €" },
  { id: "medio", corto: "25–60 €" },
  { id: "alto", corto: "60–150 €" },
  { id: "premium", corto: "+150 €" },
];
const ESTILOS = ["old money", "minimalista", "streetwear", "smart casual", "gorpcore", "vintage", "y2k"];
const PRESUPUESTOS = [
  { centimos: 2500, titulo: "25 €" },
  { centimos: 6000, titulo: "60 €" },
  { centimos: 15000, titulo: "150 €" },
  { centimos: null, titulo: "Sin límite" },
];
const CRITERIOS = {
  visual: "Parecido visual",
  color: "Color",
  gramaje: "Grosor del tejido",
  material: "Material",
  fit: "Corte",
  detalles: "Detalles",
};
const ROLES = {
  superior: "Parte de arriba",
  inferior: "Parte de abajo",
  vestido: "Vestido",
  abrigo: "Abrigo",
  calzado: "Calzado",
  bolso: "Bolso",
  accesorio: "Complemento",
};
const CORTES = { ajustado: "Ajustado", regular: "Regular", relajado: "Relajado", oversize: "Oversize", otro: "Otro" };
const GROSORES = { ligero: "Ligero", medio: "Medio", pesado: "Pesado" };

// --- Estado ---

const estado = {
  pestana: "buscar",
  pantalla: "inicio", // inicio · ficha · resultados (dentro de Buscar)
  menuAbierto: false,
  pidiendoEnlace: false,
  analizando: false,
  analisis: null,
  fotoLocal: null,
  ficha: null,
  busqueda: { estado: "inactivo", datos: null, error: null, rango: null },
  /** Prenda con la que se crean los outfits: { ficha, producto, imagen_url, foto }. */
  base: null,
  /** Ideas de Pinterest para la búsqueda actual. */
  inspiracion: { estado: "inactivo", datos: null, error: null },
  /** «Tus fotos»: lo que se ha analizado en este navegador, de lo más reciente a lo más antiguo. */
  historial: [],
  outfits: { estilo: "old money", presupuesto: 6000, generando: false, progreso: "", respuesta: null, error: null, estiloUsado: null },
};

const contenido = document.getElementById("contenido");

function render() {
  const vista =
    estado.pestana === "outfits"
      ? vistaOutfits()
      : estado.pestana === "guardados"
        ? vistaGuardados()
        : estado.pantalla === "ficha" && estado.analisis
          ? vistaFicha()
          : estado.pantalla === "resultados" && estado.analisis
            ? vistaResultados()
            : vistaInicio();
  // Sin clave todo son datos de ejemplo (siempre los mismos vaqueros): que se vea bien claro.
  const avisoPrueba =
    api.modoPrueba() &&
    h(
      "button",
      { class: "banda-prueba", onclick: () => abrirAjustes() },
      icono("aviso", 16),
      h("span", {}, h("strong", {}, "Datos de ejemplo. "), "Toca aquí y pega tu clave para buscar de verdad."),
    );
  contenido.replaceChildren(...[avisoPrueba, vista].filter(Boolean));
  for (const boton of document.querySelectorAll(".pestanas button")) {
    boton.setAttribute("aria-selected", String(boton.dataset.pestana === estado.pestana));
  }
}

/** Navegación dentro de Buscar, con historial (el gesto de volver de Safari funciona). */
function irA(pantalla) {
  estado.pantalla = pantalla;
  history.pushState({ pantalla }, "");
  render();
  window.scrollTo(0, 0);
}

function cambiarPestana(pestana) {
  if (estado.pestana === pestana && pestana === "buscar" && estado.pantalla !== "inicio") {
    estado.pantalla = "inicio";
  }
  estado.pestana = pestana;
  render();
  window.scrollTo(0, 0);
}

addEventListener("popstate", (evento) => {
  estado.pestana = "buscar";
  estado.pantalla = evento.state?.pantalla ?? "inicio";
  render();
});

// --- Piezas comunes ---

function cabecera(titulo, { atras, accion } = {}) {
  return h(
    "header",
    { class: "cabecera" },
    atras
      ? h("button", { class: "boton-icono cristal", onclick: atras, "aria-label": "Atrás" }, icono("atras"))
      : h("span", { class: "hueco" }),
    h("h1", {}, titulo),
    accion ?? h("span", { class: "hueco" }),
  );
}

function muestraColor(hex) {
  return h("span", { class: "muestra", style: { background: hex }, "aria-hidden": "true" });
}

function nombrePrenda(ficha) {
  return conMayuscula(ficha.subcategoria ?? ficha.categoria);
}

function mostrarError(error) {
  const esClave = error?.codigo === "CLAVE_NO_VALIDA";
  abrirHoja(
    "No ha podido ser",
    h(
      "div",
      { class: "pila" },
      h("p", { class: "texto-error" }, error?.message ?? "Algo ha fallado. Inténtalo de nuevo."),
      esClave && h("button", { class: "boton principal", onclick: () => abrirAjustes() }, "Revisar la clave"),
    ),
  );
}

function segmentado(opciones, actual, alElegir, etiqueta) {
  return h(
    "div",
    { class: "segmentado", role: "radiogroup", "aria-label": etiqueta },
    opciones.map((opcion) =>
      h(
        "button",
        {
          role: "radio",
          "aria-checked": String(opcion.valor === actual),
          onclick: () => alElegir(opcion.valor),
        },
        opcion.texto,
      ),
    ),
  );
}

// --- Buscar: inicio ---

const entradaCamara = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true });
const entradaFotos = h("input", { type: "file", accept: "image/*", hidden: true });
for (const entrada of [entradaCamara, entradaFotos]) {
  entrada.addEventListener("change", () => {
    const archivo = entrada.files?.[0];
    entrada.value = "";
    if (archivo) analizarFoto(archivo);
  });
  document.body.append(entrada);
}

function vistaInicio() {
  const opciones = h(
    "div",
    { class: "opciones" },
    h("button", { class: "boton cristal grande", onclick: () => entradaCamara.click() }, icono("camara"), "Cámara"),
    h("button", { class: "boton cristal grande", onclick: () => entradaFotos.click() }, icono("fotos"), "Fotos"),
    h(
      "button",
      {
        class: "boton cristal grande",
        onclick: () => {
          estado.pidiendoEnlace = true;
          render();
          document.getElementById("campo-enlace")?.focus();
        },
      },
      icono("enlace"),
      "Pegar enlace",
    ),
    h(
      "button",
      {
        class: "boton-icono cristal cerrar-menu",
        "aria-label": "Cerrar opciones",
        onclick: () => {
          estado.menuAbierto = false;
          estado.pidiendoEnlace = false;
          render();
        },
      },
      icono("cerrar"),
    ),
  );

  const formularioEnlace = h(
    "form",
    {
      class: "formulario-enlace",
      onsubmit: (evento) => {
        evento.preventDefault();
        const texto = evento.target.elements.enlace.value;
        analizarEnlace(texto);
      },
    },
    h("input", {
      id: "campo-enlace",
      name: "enlace",
      type: "url",
      inputmode: "url",
      placeholder: "https://www.zara.com/…",
      autocomplete: "off",
      "aria-label": "Enlace de la prenda",
    }),
    navigator.clipboard?.readText &&
      h(
        "button",
        {
          type: "button",
          class: "boton secundario",
          onclick: async () => {
            try {
              const texto = await navigator.clipboard.readText();
              document.getElementById("campo-enlace").value = texto;
            } catch {
              avisar("Mantén pulsado el campo y elige Pegar");
            }
          },
        },
        "Pegar",
      ),
    h("button", { type: "submit", class: "boton principal" }, "Buscar"),
  );

  return h(
    "section",
    { class: "pantalla inicio" },
    h(
      "header",
      { class: "cabecera" },
      h("span", { class: "hueco" }),
      h("span", {}),
      h("button", { class: "boton-icono cristal", "aria-label": "Ajustes", onclick: () => abrirAjustes() }, icono("ajustes")),
    ),
    h(
      "div",
      { class: "presentacion" },
      h("h1", {}, "Encuentra el dupe"),
      h("p", {}, "Haz una foto o pega el enlace de una prenda y te enseñamos alternativas parecidas en tiendas de España."),
    ),
    h(
      "div",
      { class: "acciones" },
      estado.menuAbierto
        ? opciones
        : h(
            "button",
            {
              class: "boton principal enorme",
              onclick: () => {
                estado.menuAbierto = true;
                render();
              },
            },
            icono("buscar", 24),
            "Buscar prenda",
          ),
      estado.menuAbierto && estado.pidiendoEnlace && formularioEnlace,
    ),
    !estado.menuAbierto && tiraHistorial(),
    estado.analizando &&
      h("div", { class: "pildora cristal", role: "status" }, h("span", { class: "girando", "aria-hidden": "true" }), "Analizando la prenda…"),
  );
}

async function analizarFoto(archivo) {
  estado.analizando = true;
  render();
  try {
    const { blob, url } = await api.prepararFoto(archivo);
    await analizarFotoPreparada(blob, url);
  } catch (error) {
    mostrarError(error);
    estado.analizando = false;
    render();
  }
}

/** La foto ya reducida: se analiza y queda en «Tus fotos». */
async function analizarFotoPreparada(blob, url) {
  estado.analizando = true;
  render();
  try {
    estado.fotoLocal = url;
    const analisis = await api.analizarFoto(blob);
    abrirFicha(analisis);
    await historial.registrar(analisis, blob);
    await refrescarHistorial();
  } catch (error) {
    mostrarError(error);
  } finally {
    estado.analizando = false;
    render();
  }
}

async function analizarEnlace(texto) {
  const url = texto.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (!url) {
    avisar("Eso no parece un enlace");
    return;
  }
  estado.analizando = true;
  render();
  try {
    estado.fotoLocal = null;
    const analisis = await api.analizarEnlace(url);
    abrirFicha(analisis);
    await historial.registrar(analisis, null);
    await refrescarHistorial();
  } catch (error) {
    mostrarError(error);
  } finally {
    estado.analizando = false;
    render();
  }
}

async function refrescarHistorial() {
  estado.historial = await historial.cargar();
}

/**
 * Abre otra vez la ficha de una prenda del historial. Si era una foto de hace más de un día, el
 * servidor ya la ha borrado: se vuelve a analizar (Google Lens la necesita para buscar).
 */
async function reabrir(entrada) {
  estado.pestana = "buscar";
  if (historial.caducada(entrada)) {
    await analizarFotoPreparada(entrada.foto, URL.createObjectURL(entrada.foto));
    return;
  }
  estado.fotoLocal = entrada.foto ? URL.createObjectURL(entrada.foto) : null;
  abrirFicha(entrada.analisis);
  await historial.usar(entrada);
  await refrescarHistorial();
}

/** Miniatura de una prenda del historial (botón que la reabre). */
function celdaHistorial(entrada) {
  const fecha = new Date(entrada.fechaUso);
  return h(
    "button",
    { class: "foto-historial", onclick: () => reabrir(entrada), "aria-label": `${entrada.titulo}. Abre su ficha` },
    imagen(entrada.miniatura ?? entrada.imagen, "foto-miniatura", ""),
    h("span", { class: "titulo" }, entrada.titulo),
    h("span", { class: "secundario" }, fechaRelativa(fecha)),
  );
}

function fechaRelativa(fecha) {
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  return fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function tiraHistorial() {
  if (!estado.historial.length) return null;
  return h(
    "div",
    { class: "tira-historial" },
    h(
      "div",
      { class: "tira-cabecera" },
      h("h3", {}, "Tus fotos"),
      h("button", { class: "boton-texto", onclick: () => cambiarPestana("guardados") }, "Ver todo"),
    ),
    h("div", { class: "moodboard" }, estado.historial.slice(0, 10).map(celdaHistorial)),
  );
}

function abrirFicha(analisis) {
  estado.analisis = analisis;
  estado.ficha = structuredClone(analisis.ficha);
  estado.menuAbierto = false;
  estado.pidiendoEnlace = false;
  // La última prenda analizada es la que se usa por defecto en Outfits.
  estado.base = { ficha: estado.ficha, producto: analisis.producto_origen, imagen_url: analisis.imagen_url, foto: estado.fotoLocal };
  irA("ficha");
}

// --- Buscar: ficha ---

function vistaFicha() {
  const { analisis, ficha } = estado;
  const origen = analisis.producto_origen;
  const foto = estado.fotoLocal ?? analisis.imagen_url ?? origen?.imagen_url;
  const estimado = (campo) => ficha.campos_estimados?.includes(campo) && h("span", { class: "estimado" }, "≈ estimado");

  const fila = (titulo, campo, control) =>
    h("label", { class: "fila-ficha" }, h("span", { class: "fila-titulo" }, titulo, estimado(campo)), control);

  const texto = (campo, valor, alCambiar) =>
    h("input", { type: "text", value: valor ?? "", placeholder: "—", oninput: (e) => alCambiar(e.target.value.trim() || null) });

  const desplegable = (opciones, valor, alCambiar) =>
    h(
      "select",
      { onchange: (e) => alCambiar(e.target.value || null) },
      h("option", { value: "", selected: !valor }, "Sin indicar"),
      Object.entries(opciones).map(([id, nombre]) => h("option", { value: id, selected: id === valor }, nombre)),
    );

  const detalles = h(
    "div",
    { class: "chips" },
    ficha.detalles.map((detalle, indice) =>
      h(
        "button",
        {
          class: "chip",
          "aria-label": `Quitar ${detalle}`,
          onclick: () => {
            ficha.detalles.splice(indice, 1);
            render();
          },
        },
        detalle,
        icono("cerrar", 12),
      ),
    ),
  );

  return h(
    "section",
    { class: "pantalla ficha" },
    cabecera("Tu prenda", { atras: () => history.back() }),
    h(
      "div",
      { class: "ficha-cabecera" },
      imagen(foto, "ficha-foto", "Tu prenda"),
      h(
        "div",
        {},
        h("h2", {}, nombrePrenda(ficha)),
        ficha.subcategoria && h("p", { class: "secundario" }, conMayuscula(ficha.categoria)),
        origen && h("p", { class: "secundario" }, [origen.tienda.nombre, origen.precio && euros(origen.precio.centimos)].filter(Boolean).join(" · ")),
      ),
    ),
    origen &&
      estado.fotoLocal &&
      h(
        "a",
        { class: "tarjeta identificada", href: origen.url, target: "_blank", rel: "noopener noreferrer" },
        icono("check", 18),
        h("span", {}, h("strong", {}, "La hemos reconocido: "), origen.titulo, h("span", { class: "secundario" }, ` · ${origen.tienda.nombre}`)),
      ),
    h("p", { class: "nota" }, "Revisa la ficha: la búsqueda usa estos datos y pone primero las prendas de este color. Puedes corregir lo que no esté bien."),
    h(
      "div",
      { class: "tarjeta lista" },
      fila(
        "Color",
        "color_principal",
        h(
          "span",
          { class: "con-muestra" },
          muestraColor(ficha.color_principal.hex),
          texto("color", ficha.color_principal.nombre, (v) => (ficha.color_principal.nombre = v ?? ficha.color_principal.nombre)),
        ),
      ),
      fila("Material", "material", texto("material", ficha.material, (v) => (ficha.material = v))),
      fila("Corte", "fit", desplegable(CORTES, ficha.fit, (v) => (ficha.fit = v))),
      fila("Grosor", "gramaje_estimado", desplegable(GROSORES, ficha.gramaje_estimado, (v) => (ficha.gramaje_estimado = v))),
      fila("Estampado", "estampado", texto("estampado", ficha.estampado, (v) => (ficha.estampado = v ?? "liso"))),
    ),
    ficha.detalles.length > 0 && h("div", { class: "seccion" }, h("h3", {}, "Detalles"), detalles),
    h(
      "div",
      { class: "barra-inferior" },
      h("button", { class: "boton principal ancho", onclick: buscarAlternativas }, icono("buscar"), "Buscar alternativas"),
      h(
        "button",
        {
          class: "boton cristal",
          onclick: () => {
            estado.base = { ...estado.base, ficha: estado.ficha };
            cambiarPestana("outfits");
          },
        },
        icono("camiseta"),
        "Outfits",
      ),
    ),
  );
}

async function buscarAlternativas() {
  estado.busqueda = { estado: "cargando", datos: null, error: null, rango: null };
  estado.inspiracion = { estado: "inactivo", datos: null, error: null };
  irA("resultados");
  try {
    const datos = await api.buscar(estado.analisis.imagen_url, estado.ficha);
    estado.busqueda = { estado: "listo", datos, error: null, rango: null };
  } catch (error) {
    estado.busqueda = { estado: "error", datos: null, error, rango: null };
  }
  if (estado.pestana === "buscar" && estado.pantalla === "resultados") render();
}

/** Más prendas del mismo rollo: referencias de Pinterest → ideas → tiendas. */
async function buscarInspiracion() {
  estado.inspiracion = { estado: "cargando", datos: null, error: null };
  render();
  try {
    const yaMostrados = (estado.busqueda.datos?.alternativas ?? []).map((a) => a.producto.id);
    const datos = await api.inspiracion(estado.ficha, yaMostrados, estado.analisis?.imagen_url);
    estado.inspiracion = { estado: "listo", datos, error: null };
  } catch (error) {
    estado.inspiracion = { estado: "error", datos: null, error };
  }
  if (estado.pestana === "buscar" && estado.pantalla === "resultados") render();
}

// --- Buscar: resultados ---

function vistaResultados() {
  const { busqueda, ficha } = estado;
  const todas = busqueda.datos?.alternativas ?? [];
  const visibles = busqueda.rango ? todas.filter((a) => a.producto.rango === busqueda.rango) : todas;
  const conteo = (rango) => (rango ? todas.filter((a) => a.producto.rango === rango).length : todas.length);
  // Primero las de tu color; después, las de otros colores.
  const deTuColor = visibles.filter((a) => a.mismo_color !== false);
  const otrosColores = visibles.filter((a) => a.mismo_color === false);

  let cuerpo;
  if (busqueda.estado === "cargando") {
    cuerpo = h(
      "div",
      { class: "rejilla", "aria-label": "Buscando alternativas" },
      Array.from({ length: 6 }, () => h("div", { class: "tarjeta-cargando" }, h("div"), h("span"), h("span"))),
    );
  } else if (busqueda.estado === "error") {
    cuerpo = h(
      "div",
      { class: "vacio" },
      icono("aviso", 36),
      h("h2", {}, "No ha podido ser"),
      h("p", {}, busqueda.error.message),
      h("button", { class: "boton cristal", onclick: buscarAlternativas }, "Reintentar"),
    );
  } else if (visibles.length === 0) {
    cuerpo =
      busqueda.rango && todas.length > 0
        ? h(
            "div",
            { class: "vacio" },
            h("h2", {}, "Nada en este rango"),
            h("p", {}, "Prueba con otro rango de precio."),
            h("button", { class: "boton cristal", onclick: () => ((busqueda.rango = null), render()) }, "Ver todo"),
          )
        : h(
            "div",
            { class: "vacio" },
            h("h2", {}, "Sin alternativas"),
            h("p", {}, "No hemos encontrado prendas parecidas en las tiendas de la lista. Prueba con las ideas de Pinterest o ajusta la ficha."),
          );
  } else if (otrosColores.length === 0) {
    cuerpo = h("div", { class: "rejilla" }, visibles.map(tarjetaAlternativa));
  } else {
    cuerpo = h(
      "div",
      { class: "pila-secciones" },
      deTuColor.length > 0 &&
        h(
          "div",
          { class: "seccion" },
          h("h3", {}, muestraColor(ficha.color_principal.hex), `En ${ficha.color_principal.nombre} · ${deTuColor.length}`),
          h("div", { class: "rejilla" }, deTuColor.map(tarjetaAlternativa)),
        ),
      h(
        "div",
        { class: "seccion" },
        h("h3", {}, `En otros colores · ${otrosColores.length}`),
        h("div", { class: "rejilla" }, otrosColores.map(tarjetaAlternativa)),
      ),
    );
  }

  return h(
    "section",
    { class: "pantalla resultados" },
    cabecera("Alternativas", { atras: () => history.back() }),
    h(
      "div",
      { class: "filtro-fijo" },
      segmentado(
        RANGOS.map((r) => ({ valor: r.id, texto: r.corto })),
        busqueda.rango,
        (valor) => {
          busqueda.rango = valor;
          render();
        },
        "Rango de precio",
      ),
    ),
    h(
      "div",
      { class: "resumen" },
      muestraColor(ficha.color_principal.hex),
      h("strong", {}, nombrePrenda(ficha)),
      busqueda.estado === "listo" &&
        h("span", { class: "secundario" }, conteo(busqueda.rango) === 1 ? "1 alternativa" : `${conteo(busqueda.rango)} alternativas`),
    ),
    cuerpo,
    busqueda.estado === "listo" && bloqueInspiracion(),
  );
}

/** «Más del mismo rollo»: ideas sacadas de Pinterest, con prendas reales de las tiendas. */
function bloqueInspiracion() {
  const insp = estado.inspiracion ?? { estado: "inactivo" };
  const cabeceraBloque = h(
    "div",
    { class: "inspiracion-cabecera" },
    h("h2", {}, "Más del mismo rollo"),
    h("p", { class: "secundario" }, "Miramos cómo se lleva esta prenda en Pinterest y te proponemos prendas muy parecidas, también en otros colores."),
  );

  if (insp.estado === "inactivo") {
    return h(
      "div",
      { class: "tarjeta inspiracion" },
      cabeceraBloque,
      h("button", { class: "boton principal ancho", onclick: buscarInspiracion }, icono("destellos"), "Ver ideas de Pinterest"),
    );
  }
  if (insp.estado === "cargando") {
    return h(
      "div",
      { class: "tarjeta inspiracion" },
      cabeceraBloque,
      h("p", { class: "progreso", role: "status" }, h("span", { class: "girando", "aria-hidden": "true" }), "Buscando inspiración en Pinterest…"),
      h("p", { class: "nota" }, "Tarda casi un minuto: comparamos cada prenda con tu foto."),
    );
  }
  if (insp.estado === "error") {
    return h(
      "div",
      { class: "tarjeta inspiracion" },
      cabeceraBloque,
      h("p", { class: "texto-error" }, insp.error.message),
      h("button", { class: "boton cristal ancho", onclick: buscarInspiracion }, "Reintentar"),
    );
  }

  const { rollo, referencias, ideas } = insp.datos;
  return h(
    "div",
    { class: "inspiracion" },
    cabeceraBloque,
    h("p", { class: "rollo" }, rollo),
    referencias.length > 0 &&
      h(
        "div",
        { class: "moodboard", "aria-label": "Referencias de Pinterest" },
        referencias.map((r) =>
          r.enlace
            ? h("a", { href: r.enlace, target: "_blank", rel: "noopener noreferrer" }, imagen(r.imagen, "referencia", r.titulo ?? "Referencia de Pinterest"))
            : imagen(r.imagen, "referencia", r.titulo ?? "Referencia de Pinterest"),
        ),
      ),
    ideas.length === 0
      ? h("p", { class: "secundario" }, "No hemos encontrado más prendas de este estilo en las tiendas de la lista.")
      : ideas.map((idea) =>
          h(
            "div",
            { class: "seccion" },
            h("h3", {}, idea.titulo),
            h(
              "div",
              { class: "rejilla" },
              idea.productos.map((producto) =>
                tarjetaAlternativa({ producto, similitud: null, etiquetas: [], fuente: "shopping", mismo_color: null }),
              ),
            ),
          ),
        ),
  );
}

function etiquetaSimilitud(etiqueta) {
  return h(
    "span",
    { class: `etiqueta ${etiqueta.tipo}` },
    icono(etiqueta.tipo === "coincide" ? "check" : "aviso", 12),
    etiqueta.texto,
  );
}

function tarjetaAlternativa(alternativa) {
  const p = alternativa.producto;
  return h(
    "button",
    { class: "tarjeta-alternativa", onclick: () => abrirDetalle(alternativa) },
    imagen(p.imagen_url, "foto-producto", p.titulo),
    h("span", { class: "marca" }, p.marca ?? p.tienda.nombre),
    h("span", { class: "titulo" }, p.titulo),
    h(
      "span",
      { class: "precio-fila" },
      h("strong", {}, euros(p.precio.centimos)),
      p.precio_anterior && h("s", { class: "secundario" }, euros(p.precio_anterior.centimos)),
      alternativa.similitud && h("span", { class: "porcentaje", "aria-label": `${alternativa.similitud.total} % de parecido` }, `${alternativa.similitud.total} %`),
    ),
    alternativa.etiquetas.length > 0 && h("span", { class: "etiquetas" }, alternativa.etiquetas.slice(0, 2).map(etiquetaSimilitud)),
  );
}

function abrirDetalle(alternativa) {
  const p = alternativa.producto;
  const botonGuardar = h("button", { class: "boton cristal" });
  const pintarGuardar = () => {
    const guardada = guardados.prendaGuardada(p.id);
    botonGuardar.replaceChildren(icono("marcador"), guardada ? "Guardada" : "Guardar");
    botonGuardar.classList.toggle("activo", guardada);
  };
  botonGuardar.addEventListener("click", () => {
    avisar(guardados.alternarPrenda(alternativa) ? "Guardada en Guardados" : "Quitada de Guardados");
    pintarGuardar();
  });
  pintarGuardar();

  const criterios = alternativa.similitud?.criterios.filter((c) => c.disponible && c.puntuacion != null) ?? [];

  let cerrar;
  cerrar = abrirHoja(
    p.marca ?? p.tienda.nombre,
    h(
      "div",
      { class: "detalle" },
      imagen(p.imagen_url, "detalle-foto", p.titulo),
      h("h2", {}, p.titulo),
      h(
        "p",
        { class: "precio-fila grande" },
        h("strong", {}, euros(p.precio.centimos)),
        p.precio_anterior && h("s", { class: "secundario" }, euros(p.precio_anterior.centimos)),
        alternativa.similitud && h("span", { class: "porcentaje" }, `${alternativa.similitud.total} % de parecido`),
      ),
      h("p", { class: "secundario" }, `${p.tienda.nombre}${alternativa.fuente === "shopping" ? " · se abre en Google Shopping" : ""}`),
      h(
        "div",
        { class: "botones" },
        h("a", { class: "boton principal ancho", href: p.url, target: "_blank", rel: "noopener noreferrer" }, icono("tienda"), "Ver en tienda"),
        botonGuardar,
      ),
      h(
        "button",
        {
          class: "boton cristal ancho",
          onclick: () => {
            estado.base = { ficha: estado.ficha, producto: p, imagen_url: p.imagen_url, foto: null };
            cerrar();
            cambiarPestana("outfits");
          },
        },
        icono("camiseta"),
        "Crear outfits con esta prenda",
      ),
      alternativa.etiquetas.length > 0 && h("div", { class: "etiquetas" }, alternativa.etiquetas.map(etiquetaSimilitud)),
      criterios.length > 0 &&
        h(
          "div",
          { class: "seccion" },
          h("h3", {}, "Por qué se parece"),
          criterios.map((c) =>
            h(
              "div",
              { class: "criterio" },
              h("span", {}, CRITERIOS[c.criterio] ?? c.criterio),
              h("span", { class: "barra", "aria-hidden": "true" }, h("span", { style: { width: `${c.puntuacion}%` } })),
              h("strong", {}, `${c.puntuacion} %`),
            ),
          ),
        ),
    ),
  );
}

// --- Outfits ---

function vistaOutfits() {
  const o = estado.outfits;
  const base = estado.base;
  if (!base) {
    return h(
      "section",
      { class: "pantalla" },
      cabecera("Outfits"),
      h(
        "div",
        { class: "vacio" },
        icono("camiseta", 40),
        h("h2", {}, "Primero, una prenda"),
        h("p", {}, "Busca una prenda (foto o enlace) y crearemos outfits alrededor de ella."),
        h("button", { class: "boton principal", onclick: () => cambiarPestana("buscar") }, "Buscar una prenda"),
      ),
    );
  }

  const estiloEscrito = !ESTILOS.includes(o.estilo) ? o.estilo : "";
  return h(
    "section",
    { class: "pantalla outfits" },
    cabecera("Outfits"),
    h(
      "div",
      { class: "tarjeta base" },
      imagen(base.foto ?? base.imagen_url ?? base.producto?.imagen_url, "base-foto", "Tu prenda"),
      h(
        "div",
        {},
        h("span", { class: "marca" }, "Tu prenda"),
        h("strong", {}, nombrePrenda(base.ficha)),
        base.producto && h("span", { class: "secundario" }, base.producto.tienda.nombre),
      ),
      h("button", { class: "boton secundario", onclick: () => cambiarPestana("buscar") }, "Cambiar"),
    ),
    h(
      "div",
      { class: "seccion" },
      h("h3", {}, "Estilo"),
      h(
        "div",
        { class: "chips" },
        ESTILOS.map((estilo) =>
          h(
            "button",
            {
              class: "chip",
              "aria-pressed": String(o.estilo === estilo),
              onclick: () => {
                o.estilo = estilo;
                render();
              },
            },
            conMayuscula(estilo),
          ),
        ),
      ),
      h("input", {
        type: "text",
        class: "campo",
        placeholder: "U otro estilo: «surfero», «japonés»…",
        value: estiloEscrito,
        maxlength: 40,
        oninput: (e) => (o.estilo = e.target.value.trim() || "old money"),
      }),
    ),
    h(
      "div",
      { class: "seccion" },
      h("h3", {}, "Máximo por prenda"),
      segmentado(
        PRESUPUESTOS.map((p) => ({ valor: p.centimos, texto: p.titulo })),
        o.presupuesto,
        (valor) => {
          o.presupuesto = valor;
          render();
        },
        "Máximo por prenda",
      ),
    ),
    h(
      "button",
      { class: "boton principal ancho", disabled: o.generando, onclick: generarOutfits },
      icono("destellos"),
      o.respuesta ? "Crear otros outfits" : "Crear outfits",
    ),
    o.generando &&
      h("p", { class: "progreso", role: "status" }, h("span", { class: "girando", "aria-hidden": "true" }), o.progreso || "Empezando…"),
    o.generando && h("p", { class: "nota" }, "Tarda alrededor de un minuto: buscamos referencias del estilo y prendas reales."),
    o.error && h("div", { class: "tarjeta error" }, icono("aviso"), h("p", {}, o.error.message)),
    o.respuesta && !o.generando && resultadosOutfits(o.respuesta, o.estiloUsado),
  );
}

async function generarOutfits() {
  const o = estado.outfits;
  const base = estado.base;
  o.generando = true;
  o.error = null;
  o.progreso = "";
  render();
  try {
    const respuesta = await api.crearOutfits(
      {
        prenda_base: { ficha: base.ficha, producto: base.producto ?? null, imagen_url: base.imagen_url ?? null },
        estilo: o.estilo,
        presupuesto: { maximo_por_prenda_centimos: o.presupuesto },
      },
      (mensaje) => {
        o.progreso = mensaje;
        const progreso = document.querySelector(".progreso");
        if (progreso) progreso.lastChild.textContent = mensaje;
      },
    );
    // En las piezas base sin foto pública se muestra la foto local.
    for (const outfit of respuesta.outfits) {
      for (const pieza of outfit.piezas) if (pieza.es_prenda_base && !pieza.imagen_url) pieza.imagen_url = base.foto;
    }
    o.respuesta = respuesta;
    o.estiloUsado = o.estilo;
  } catch (error) {
    o.error = error;
  } finally {
    o.generando = false;
    if (estado.pestana === "outfits") {
      render();
      document.getElementById("resultados-outfits")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function resultadosOutfits(respuesta, estilo) {
  const perfil = respuesta.perfil_estilo;
  return h(
    "div",
    { id: "resultados-outfits", class: "seccion" },
    h(
      "div",
      { class: "perfil" },
      h("div", { class: "paleta", "aria-hidden": "true" }, perfil.paleta.map((c) => muestraColor(c.hex))),
      h("p", { class: "secundario" }, perfil.resumen),
    ),
    respuesta.outfits.length === 0
      ? h("p", {}, "No hemos encontrado prendas para este estilo con ese presupuesto. Prueba con otro.")
      : h("div", { class: "carrusel" }, respuesta.outfits.map((outfit) => tarjetaOutfit(outfit, estilo, { editable: true }))),
  );
}

function collage(outfit) {
  const piezas = outfit.piezas.slice(0, 4);
  return h(
    "div",
    { class: `collage piezas-${piezas.length}` },
    piezas.map((pieza) =>
      h(
        "div",
        { class: "collage-celda" },
        imagen(pieza.imagen_url ?? pieza.producto?.imagen_url, "", pieza.descripcion),
        pieza.es_prenda_base && h("span", { class: "insignia" }, "Tu prenda"),
      ),
    ),
  );
}

function tarjetaOutfit(outfit, estilo, { editable = false } = {}) {
  const botonGuardar = h("button", { class: "boton cristal ancho" });
  const pintarGuardar = () => {
    const guardado = guardados.outfitGuardado(outfit);
    botonGuardar.replaceChildren(icono("marcador"), guardado ? "Guardado" : "Guardar outfit");
    botonGuardar.classList.toggle("activo", guardado);
  };
  botonGuardar.addEventListener("click", () => {
    avisar(guardados.alternarOutfit(outfit, estilo) ? "Outfit guardado" : "Outfit quitado de Guardados");
    pintarGuardar();
  });
  pintarGuardar();

  return h(
    "article",
    { class: "tarjeta-outfit" },
    collage(outfit),
    h("h3", {}, outfit.titulo),
    h("p", { class: "secundario" }, outfit.por_que_encaja),
    h("p", { class: "total" }, h("span", {}, "Total"), h("strong", {}, euros(outfit.precio_total.centimos))),
    h(
      "ul",
      { class: "piezas" },
      outfit.piezas.map((pieza) => filaPieza(outfit, pieza, editable)),
    ),
    botonGuardar,
  );
}

function filaPieza(outfit, pieza, editable) {
  const p = pieza.producto;
  return h(
    "li",
    {},
    imagen(pieza.imagen_url ?? p?.imagen_url, "pieza-foto", pieza.descripcion),
    h(
      "div",
      { class: "pieza-texto" },
      h("span", { class: "marca" }, `${ROLES[pieza.rol] ?? pieza.rol}${pieza.es_prenda_base ? " · Tu prenda" : ""}`),
      h("span", { class: "titulo" }, p?.titulo ?? conMayuscula(pieza.descripcion)),
      p && h("span", { class: "secundario" }, [p.tienda.nombre, p.precio && euros(p.precio.centimos)].filter(Boolean).join(" · ")),
    ),
    h(
      "div",
      { class: "pieza-acciones" },
      p?.url && h("a", { class: "boton-icono", href: p.url, target: "_blank", rel: "noopener noreferrer", "aria-label": "Ver en tienda" }, icono("tienda", 18)),
      editable &&
        pieza.consulta &&
        h("button", { class: "boton-icono", "aria-label": "Cambiar esta prenda", onclick: () => abrirCambiarPieza(outfit, pieza) }, icono("cambiar", 18)),
    ),
  );
}

function abrirCambiarPieza(outfit, pieza) {
  const lista = h("div", { class: "pila" }, h("p", { class: "progreso" }, h("span", { class: "girando" }), "Buscando otras opciones…"));
  const cerrar = abrirHoja(`Otra ${ROLES[pieza.rol]?.toLowerCase() ?? "prenda"}`, lista);
  const enUso = estado.outfits.respuesta.outfits.flatMap((o) => o.piezas.map((x) => x.producto?.id).filter(Boolean));
  api
    .cambiarPieza(pieza.consulta, estado.outfits.presupuesto, enUso)
    .then((opciones) => {
      if (opciones.length === 0) {
        lista.replaceChildren(h("p", {}, "No hay más opciones para esta prenda con este presupuesto."));
        return;
      }
      lista.replaceChildren(
        ...opciones.map((producto) =>
          h(
            "button",
            {
              class: "fila-opcion",
              onclick: () => {
                pieza.producto = producto;
                pieza.imagen_url = producto.imagen_url;
                outfit.precio_total = {
                  centimos: outfit.piezas.reduce((suma, x) => suma + (x.producto?.precio?.centimos ?? 0), 0),
                  moneda: "EUR",
                };
                cerrar();
                render();
                avisar("Prenda cambiada");
              },
            },
            imagen(producto.imagen_url, "pieza-foto", producto.titulo),
            h(
              "span",
              { class: "pieza-texto" },
              h("span", { class: "marca" }, producto.marca ?? producto.tienda.nombre),
              h("span", { class: "titulo" }, producto.titulo),
              h("strong", {}, euros(producto.precio.centimos)),
            ),
          ),
        ),
      );
    })
    .catch((error) => lista.replaceChildren(h("p", { class: "texto-error" }, error.message)));
}

// --- Guardados ---

function vistaGuardados() {
  const outfits = guardados.outfits();
  const prendas = guardados.prendas();
  if (outfits.length === 0 && prendas.length === 0 && estado.historial.length === 0) {
    return h(
      "section",
      { class: "pantalla" },
      cabecera("Guardados"),
      h(
        "div",
        { class: "vacio" },
        icono("marcador", 40),
        h("h2", {}, "Aún no has guardado nada"),
        h("p", {}, "Guarda alternativas y outfits para tenerlos siempre a mano. Las fotos que busques también aparecerán aquí."),
        h("button", { class: "boton cristal", onclick: () => cambiarPestana("buscar") }, "Buscar una prenda"),
      ),
    );
  }

  const borrar = (alBorrar, texto) =>
    h(
      "button",
      {
        class: "boton-icono",
        "aria-label": texto,
        onclick: (evento) => {
          evento.stopPropagation();
          alBorrar();
          render();
        },
      },
      icono("papelera", 18),
    );

  return h(
    "section",
    { class: "pantalla guardados" },
    cabecera("Guardados"),
    estado.historial.length > 0 &&
      h(
        "div",
        { class: "seccion" },
        h(
          "div",
          { class: "tira-cabecera" },
          h("h3", {}, `Tus fotos · ${estado.historial.length}`),
          h(
            "button",
            {
              class: "boton-texto peligro",
              onclick: async () => {
                if (!confirm("¿Borrar todas las fotos del historial? Tus prendas y outfits guardados no se borran.")) return;
                await historial.borrarTodo();
                await refrescarHistorial();
                render();
              },
            },
            "Borrar todo",
          ),
        ),
        h(
          "div",
          { class: "rejilla-historial" },
          estado.historial.map((entrada) =>
            h(
              "div",
              { class: "con-borrar" },
              celdaHistorial(entrada),
              borrar(async () => {
                await historial.borrar(entrada.id);
                await refrescarHistorial();
                render();
              }, `Quitar ${entrada.titulo} del historial`),
            ),
          ),
        ),
      ),
    outfits.length > 0 &&
      h(
        "div",
        { class: "seccion" },
        h("h3", {}, "Outfits"),
        h(
          "div",
          { class: "tarjeta lista" },
          outfits.map((g) =>
            h(
              "div",
              { class: "fila-guardada" },
              h(
                "button",
                {
                  class: "fila-principal",
                  onclick: () => abrirHoja(g.outfit.titulo, tarjetaOutfit(g.outfit, g.estilo), { alCerrar: render }),
                },
                h("span", { class: "miniaturas" }, g.outfit.piezas.slice(0, 3).map((p) => imagen(p.imagen_url ?? p.producto?.imagen_url, "mini"))),
                h(
                  "span",
                  { class: "pieza-texto" },
                  h("strong", {}, g.outfit.titulo),
                  h("span", { class: "secundario" }, `${conMayuscula(g.estilo)} · ${euros(g.outfit.precio_total.centimos)}`),
                ),
              ),
              borrar(() => guardados.quitarOutfit(g.clave), "Quitar outfit"),
            ),
          ),
        ),
      ),
    prendas.length > 0 &&
      h(
        "div",
        { class: "seccion" },
        h("h3", {}, "Prendas"),
        h(
          "div",
          { class: "tarjeta lista" },
          prendas.map((g) =>
            h(
              "div",
              { class: "fila-guardada" },
              h(
                "a",
                { class: "fila-principal", href: g.producto.url, target: "_blank", rel: "noopener noreferrer" },
                imagen(g.producto.imagen_url, "pieza-foto", g.producto.titulo),
                h(
                  "span",
                  { class: "pieza-texto" },
                  h("span", { class: "marca" }, g.producto.marca ?? g.producto.tienda.nombre),
                  h("span", { class: "titulo" }, g.producto.titulo),
                  h("strong", {}, euros(g.producto.precio.centimos), g.similitud != null && h("span", { class: "porcentaje" }, ` · ${g.similitud} %`)),
                ),
              ),
              borrar(() => guardados.quitarPrenda(g.producto.id), "Quitar prenda"),
            ),
          ),
        ),
      ),
  );
}

// --- Ajustes ---

function abrirAjustes() {
  const conectado = !api.modoPrueba();
  const campo = h("input", {
    type: "password",
    class: "campo",
    placeholder: "Clave de la app (CLAVE_APP)",
    autocomplete: "off",
    "aria-label": "Clave de la app",
  });
  let cerrar;
  cerrar = abrirHoja(
    "Ajustes",
    h(
      "div",
      { class: "pila" },
      h(
        "p",
        { class: `estado-conexion ${conectado ? "ok" : ""}` },
        conectado ? "Conectado a tu servidor." : "Modo de prueba: se usan datos de ejemplo.",
      ),
      h(
        "form",
        {
          class: "pila",
          onsubmit: (evento) => {
            evento.preventDefault();
            if (!campo.value.trim()) return;
            api.guardarClaveApp(campo.value);
            cerrar();
            avisar("Clave guardada");
            render();
          },
        },
        h("label", { class: "secundario" }, "Pega la clave de la app (la de CLAVE_APP en backend/.dev.vars). Se guarda solo en este iPhone."),
        campo,
        h("button", { class: "boton principal", type: "submit" }, conectado ? "Cambiar la clave" : "Conectar"),
      ),
      conectado &&
        h(
          "button",
          {
            class: "boton cristal",
            onclick: () => {
              api.guardarClaveApp(null);
              cerrar();
              avisar("Modo de prueba activado");
              render();
            },
          },
          "Usar datos de prueba",
        ),
      h(
        "div",
        { class: "nota" },
        h("strong", {}, "Úsala como una app: "),
        "en Safari, toca Compartir y luego «Añadir a pantalla de inicio».",
      ),
    ),
  );
}

// --- Arranque ---

for (const boton of document.querySelectorAll(".pestanas button")) {
  boton.addEventListener("click", () => cambiarPestana(boton.dataset.pestana));
}
if (api.leerClaveDeLaDireccion()) avisar("Conectado a tu servidor");
history.replaceState({ pantalla: "inicio" }, "");
render();
refrescarHistorial().then(render);
