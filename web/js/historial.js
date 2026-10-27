// «Tus fotos»: cada prenda que se analiza (foto o enlace), guardada en este navegador (IndexedDB:
// las fotos no caben en localStorage). Si el navegador no deja guardar, la app sigue sin historial.

const BASE = "dupe-finder";
const ALMACEN = "historial";
/** Las más antiguas se borran solas a partir de aquí. */
export const MAXIMO = 60;
/** El servidor guarda la foto 24 h; con margen, a las 23 h hay que volver a analizarla. */
export const VIGENCIA_MS = 23 * 60 * 60 * 1000;

let conexion = null;

function abrir() {
  conexion ??= new Promise((hecho, fallo) => {
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN, { keyPath: "id" });
    peticion.onsuccess = () => hecho(peticion.result);
    peticion.onerror = () => fallo(peticion.error);
  });
  return conexion;
}

async function operar(modo, accion) {
  const base = await abrir();
  return new Promise((hecho, fallo) => {
    const transaccion = base.transaction(ALMACEN, modo);
    const resultado = accion(transaccion.objectStore(ALMACEN));
    transaccion.oncomplete = () => hecho(resultado?.result);
    transaccion.onerror = () => fallo(transaccion.error);
  });
}

/** De la más reciente a la más antigua. */
export async function cargar() {
  try {
    const todas = (await operar("readonly", (almacen) => almacen.getAll())) ?? [];
    return todas.sort((a, b) => b.fechaUso - a.fechaUso);
  } catch (error) {
    console.warn("Historial no disponible", error);
    return [];
  }
}

export const caducada = (entrada) => Boolean(entrada.foto) && Date.now() - entrada.fechaAnalisis > VIGENCIA_MS;

async function huella(analisis, foto) {
  if (foto && crypto.subtle) {
    const resumen = await crypto.subtle.digest("SHA-256", await foto.arrayBuffer());
    return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return analisis.producto_origen?.url ?? analisis.imagen_url ?? analisis.analisis_id;
}

function titulo(ficha) {
  const prenda = ficha.categoria ?? "Prenda";
  return `${prenda.charAt(0).toUpperCase()}${prenda.slice(1)} ${(ficha.color_principal?.nombre ?? "").toLowerCase()}`.trim();
}

/** Miniatura JPEG de 300 px como mucho, en data: URL (se pinta sin esperar). */
async function miniatura(foto) {
  try {
    const mapa = await createImageBitmap(foto);
    const escala = Math.min(1, 300 / Math.max(mapa.width, mapa.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(mapa.width * escala);
    lienzo.height = Math.round(mapa.height * escala);
    lienzo.getContext("2d").drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL("image/jpeg", 0.75);
  } catch {
    return null;
  }
}

/** Guarda un análisis nuevo. La misma foto o el mismo enlace no se repiten: se actualizan. */
export async function registrar(analisis, foto) {
  try {
    const id = await huella(analisis, foto);
    const ahora = Date.now();
    const existente = await operar("readonly", (almacen) => almacen.get(id));
    const entrada = {
      id,
      titulo: titulo(analisis.ficha),
      foto: foto ?? null,
      miniatura: existente?.miniatura ?? (foto ? await miniatura(foto) : null),
      imagen: analisis.producto_origen?.imagen_url ?? analisis.imagen_url ?? null,
      analisis,
      fechaAnalisis: ahora,
      fechaUso: ahora,
    };
    await operar("readwrite", (almacen) => almacen.put(entrada));
    await recortar();
  } catch (error) {
    console.warn("No se ha podido guardar en el historial", error);
  }
}

/** Reabrir una la sube arriba. */
export async function usar(entrada) {
  try {
    await operar("readwrite", (almacen) => almacen.put({ ...entrada, fechaUso: Date.now() }));
  } catch (error) {
    console.warn(error);
  }
}

export async function borrar(id) {
  try {
    await operar("readwrite", (almacen) => almacen.delete(id));
  } catch (error) {
    console.warn(error);
  }
}

export async function borrarTodo() {
  try {
    await operar("readwrite", (almacen) => almacen.clear());
  } catch (error) {
    console.warn(error);
  }
}

async function recortar() {
  const sobrantes = (await cargar()).slice(MAXIMO);
  if (sobrantes.length) await operar("readwrite", (almacen) => sobrantes.forEach((e) => almacen.delete(e.id)));
}
