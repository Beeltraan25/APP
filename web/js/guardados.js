// Prendas y outfits guardados en este iPhone (almacenamiento local del navegador).
import { escribirLocal, leerLocal } from "./api.js";

const CLAVE = "dupe.guardados";

function leer() {
  try {
    const datos = JSON.parse(leerLocal(CLAVE) ?? "{}");
    return { prendas: datos.prendas ?? [], outfits: datos.outfits ?? [] };
  } catch {
    return { prendas: [], outfits: [] };
  }
}

const escribir = (datos) => escribirLocal(CLAVE, JSON.stringify(datos));

export const prendas = () => leer().prendas;
export const outfits = () => leer().outfits;

export const prendaGuardada = (id) => leer().prendas.some((p) => p.producto.id === id);
/** Los outfits se llaman "out_1", "out_2"… en cada respuesta: se identifican por sus prendas. */
export const claveOutfit = (outfit) => outfit.piezas.map((p) => p.producto?.id ?? `base:${p.descripcion}`).join("|");
export const outfitGuardado = (outfit) => leer().outfits.some((o) => o.clave === claveOutfit(outfit));

/** Guarda o quita una alternativa. Devuelve true si queda guardada. */
export function alternarPrenda(alternativa) {
  const datos = leer();
  const indice = datos.prendas.findIndex((p) => p.producto.id === alternativa.producto.id);
  if (indice >= 0) datos.prendas.splice(indice, 1);
  else datos.prendas.unshift({ producto: alternativa.producto, similitud: alternativa.similitud?.total ?? null, fecha: Date.now() });
  escribir(datos);
  return indice < 0;
}

export function alternarOutfit(outfit, estilo) {
  const datos = leer();
  const clave = claveOutfit(outfit);
  const indice = datos.outfits.findIndex((o) => o.clave === clave);
  if (indice >= 0) datos.outfits.splice(indice, 1);
  else datos.outfits.unshift({ clave, outfit, estilo, fecha: Date.now() });
  escribir(datos);
  return indice < 0;
}

export function quitarPrenda(id) {
  const datos = leer();
  datos.prendas = datos.prendas.filter((p) => p.producto.id !== id);
  escribir(datos);
}

export function quitarOutfit(clave) {
  const datos = leer();
  datos.outfits = datos.outfits.filter((o) => o.clave !== clave);
  escribir(datos);
}
