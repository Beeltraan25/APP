// Cliente del backend de Dupe Finder (mismo servidor que sirve esta web).
// Sin clave guardada, funciona en modo de prueba con los datos de demo/.

const CLAVE_ALMACEN = "dupe.clave";
const INSTALACION_ALMACEN = "dupe.instalacion";

export class ErrorApp extends Error {
  constructor(mensaje, codigo = "DESCONOCIDO", estado = 0) {
    super(mensaje);
    this.codigo = codigo;
    this.estado = estado;
  }
}

// --- Almacenamiento local (puede fallar en navegación privada) ---

export function leerLocal(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function escribirLocal(clave, valor) {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: la web sigue funcionando, pero no recuerda nada.
  }
}

export const claveApp = () => leerLocal(CLAVE_ALMACEN);
export const guardarClaveApp = (clave) => escribirLocal(CLAVE_ALMACEN, clave?.trim() || null);
export const modoPrueba = () => !claveApp();

function idInstalacion() {
  let id = leerLocal(INSTALACION_ALMACEN);
  if (!id) {
    id = crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    escribirLocal(INSTALACION_ALMACEN, id);
  }
  return id;
}

/** Lee "#clave=..." de la dirección (enlace de configuración), la guarda y la borra de la barra. */
export function leerClaveDeLaDireccion() {
  const coincidencia = location.hash.match(/clave=([^&]+)/);
  if (!coincidencia) return false;
  guardarClaveApp(decodeURIComponent(coincidencia[1]));
  history.replaceState(null, "", location.pathname + location.search);
  return true;
}

// --- Peticiones ---

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      ...opciones,
      headers: { ...opciones.headers, "X-Clave-App": claveApp() ?? "", "X-Instalacion-Id": idInstalacion() },
    });
  } catch {
    throw new ErrorApp("Parece que no hay conexión. Revisa tu internet y vuelve a intentarlo.", "SIN_CONEXION");
  }
  if (!respuesta.ok) {
    let error = null;
    try {
      error = (await respuesta.json()).error;
    } catch {
      // Respuesta sin JSON.
    }
    throw new ErrorApp(error?.mensaje ?? "Algo ha fallado. Inténtalo de nuevo.", error?.codigo, respuesta.status);
  }
  return respuesta;
}

const pedirJSON = async (ruta, cuerpo) =>
  (
    await pedir(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
  ).json();

// --- Modo de prueba ---

const esperar = (ms) => new Promise((hecho) => setTimeout(hecho, ms));

/** Los datos de prueba apuntan a la foto de ejemplo en GitHub: se usa la copia local. */
function arreglarDemo(datos) {
  const local = new URL("demo/prenda.jpg", location.href).toString();
  return JSON.parse(JSON.stringify(datos).replace(/https:\/\/raw\.githubusercontent\.com\/[^"]*\/prenda\.jpg/g, local));
}

async function demo(nombre, retraso = 900) {
  await esperar(retraso);
  const respuesta = await fetch(`demo/${nombre}.json`);
  return arreglarDemo(await respuesta.json());
}

// --- API ---

export async function analizarFoto(blob) {
  if (modoPrueba()) return demo("analisis-foto", 1200);
  const formulario = new FormData();
  formulario.append("imagen", blob, "prenda.jpg");
  return (await pedir("v1/analizar", { method: "POST", body: formulario })).json();
}

export async function analizarEnlace(url) {
  // En modo de prueba se usa la misma prenda que la foto (unos vaqueros), que encaja con las alternativas.
  if (modoPrueba()) return demo("analisis-foto", 1200);
  return pedirJSON("v1/analizar", { pagina: { url } });
}

export async function buscar(imagenUrl, ficha) {
  if (modoPrueba()) return demo("busqueda", 1400);
  return pedirJSON("v1/buscar", { imagen_url: imagenUrl ?? null, ficha });
}

/** Los outfits llegan por líneas (NDJSON): avisos de progreso y, al final, el resultado. */
export async function crearOutfits(cuerpo, alProgresar) {
  if (modoPrueba()) {
    for (const mensaje of ["Buscando referencias de estilo…", "Estudiando el estilo…", "Diseñando los outfits…", "Buscando las prendas…"]) {
      alProgresar(mensaje);
      await esperar(700);
    }
    return demo("outfits", 300);
  }
  const respuesta = await pedir("v1/outfits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (value) pendiente += value;
    const lineas = pendiente.split("\n");
    pendiente = done ? "" : lineas.pop();
    for (const linea of lineas) {
      if (!linea.trim()) continue;
      const evento = JSON.parse(linea);
      if (evento.tipo === "progreso") alProgresar(evento.mensaje);
      if (evento.tipo === "resultado") return evento.datos;
      if (evento.tipo === "error") throw new ErrorApp(evento.error.mensaje, evento.error.codigo);
    }
    if (done) break;
  }
  throw new ErrorApp("La respuesta se ha cortado. Inténtalo de nuevo.", "RESPUESTA_INCOMPLETA");
}

/** Más prendas del mismo rollo, a partir de referencias de Pinterest. */
export async function inspiracion(ficha, excluir, imagenUrl) {
  if (modoPrueba()) return demo("inspiracion", 1800);
  return pedirJSON("v1/inspiracion", { ficha, excluir, imagen_url: imagenUrl ?? null });
}

export async function cambiarPieza(consulta, maximoCentimos, excluir) {
  if (modoPrueba()) {
    const busqueda = await demo("busqueda", 600);
    return busqueda.alternativas.map((a) => a.producto).filter((p) => !excluir.includes(p.id)).slice(0, 6);
  }
  const datos = await pedirJSON("v1/outfits/cambiar-pieza", {
    consulta,
    presupuesto: { maximo_por_prenda_centimos: maximoCentimos },
    excluir,
  });
  return datos.opciones;
}

// --- Foto ---

/** Reduce la foto a 1024 px en JPEG: menos datos móviles y análisis más rápido. */
export async function prepararFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  const imagen = new Image();
  imagen.src = url;
  await imagen.decode();
  const escala = Math.min(1, 1024 / Math.max(imagen.naturalWidth, imagen.naturalHeight));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.naturalWidth * escala);
  lienzo.height = Math.round(imagen.naturalHeight * escala);
  lienzo.getContext("2d").drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise((hecho) => lienzo.toBlob(hecho, "image/jpeg", 0.75));
  if (!blob) throw new ErrorApp("No hemos podido leer la foto. Prueba con otra.", "IMAGEN_NO_VALIDA");
  return { blob, url };
}
