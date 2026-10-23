// Utilidades de interfaz: crear elementos, formatos y hojas modales.

/** Crea un elemento: h("button", { class: "x", onclick }, "Texto", otroElemento). */
export function h(etiqueta, atributos = {}, ...hijos) {
  const elemento = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos ?? {})) {
    if (valor == null || valor === false) continue;
    if (nombre.startsWith("on") && typeof valor === "function") elemento.addEventListener(nombre.slice(2), valor);
    else if (nombre === "style" && typeof valor === "object") Object.assign(elemento.style, valor);
    else if (valor === true) elemento.setAttribute(nombre, "");
    else elemento.setAttribute(nombre, valor);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    elemento.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return elemento;
}

/** Iconos sencillos en SVG (trazo, heredan el color del texto). */
const TRAZOS = {
  camara: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  fotos: "M4 5h16v14H4z M4 15l5-5 4 4 3-3 4 4 M15.5 9.5h.01",
  enlace: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  buscar: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M16 16l5 5",
  camiseta: "M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3c-1 2-2.5 3-4 3s-3-1-4-3z",
  marcador: "M6 3h12v18l-6-4-6 4z",
  atras: "M15 5l-7 7 7 7",
  cerrar: "M6 6l12 12 M18 6L6 18",
  tienda: "M7 17L17 7 M9 7h8v8",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  cambiar: "M4 9h13l-3-3 M20 15H7l3 3",
  papelera: "M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13",
  destellos: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  check: "M5 12l5 5 9-10",
  aviso: "M12 4l9 16H3z M12 10v4 M12 17h.01",
};

export function icono(nombre, tamano = 20) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", tamano);
  svg.setAttribute("height", tamano);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icono");
  for (const d of TRAZOS[nombre].split(" M")) {
    const trazo = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trazo.setAttribute("d", d.startsWith("M") ? d : `M${d}`);
    svg.append(trazo);
  }
  return svg;
}

const formatoEuros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const euros = (centimos) => formatoEuros.format(centimos / 100);

export const conMayuscula = (texto) => (texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "");

/** Imagen de tienda: sin "referer" (algunas tiendas bloquean imágenes enlazadas) y con hueco si falla. */
export function imagen(url, clase = "", alt = "") {
  if (!url) return h("div", { class: `imagen-vacia ${clase}`, "aria-hidden": "true" }, icono("fotos", 28));
  const elemento = h("img", { src: url, alt, class: clase, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  elemento.addEventListener("error", () => elemento.replaceWith(h("div", { class: `imagen-vacia ${clase}`, "aria-hidden": "true" }, icono("fotos", 28))));
  return elemento;
}

/** Hoja que sube desde abajo (como las de iOS). Devuelve una función para cerrarla. */
export function abrirHoja(titulo, contenido, { alCerrar } = {}) {
  const dialogo = h("dialog", { class: "hoja", "aria-label": titulo });
  const cerrar = () => dialogo.close();
  dialogo.append(
    h(
      "div",
      { class: "hoja-cabecera" },
      h("span", { class: "hoja-asa", "aria-hidden": "true" }),
      h("h2", {}, titulo),
      h("button", { class: "boton-icono", onclick: cerrar, "aria-label": "Cerrar" }, icono("cerrar", 18)),
    ),
    h("div", { class: "hoja-cuerpo" }, contenido),
  );
  dialogo.addEventListener("close", () => {
    dialogo.remove();
    alCerrar?.();
  });
  // Tocar fuera cierra la hoja.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) cerrar();
  });
  document.body.append(dialogo);
  dialogo.showModal();
  return cerrar;
}

let temporizadorAviso;
/** Aviso breve abajo (p. ej. "Guardado"). */
export function avisar(texto) {
  document.querySelector(".aviso")?.remove();
  const aviso = h("div", { class: "aviso", role: "status" }, texto);
  document.body.append(aviso);
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.remove(), 2200);
}
