import type { Entorno } from "../src/entorno";
import type { FichaIA } from "../src/esquemas/ficha";
import type { PeticionJSON, ProveedorIA } from "../src/ia/proveedor";

/** Workers KV en memoria, con lo justo que usa el backend. */
export class KVSimulado {
  readonly datos = new Map<string, { valor: string | ArrayBuffer; metadata: unknown }>();
  escrituras = 0;

  async get(clave: string, tipo?: "text" | "json" | "arrayBuffer") {
    const entrada = this.datos.get(clave);
    if (!entrada) return null;
    if (tipo === "json") return JSON.parse(entrada.valor as string);
    if (tipo === "arrayBuffer") return entrada.valor;
    return entrada.valor;
  }

  async getWithMetadata(clave: string, tipo?: "text" | "json" | "arrayBuffer") {
    return { value: await this.get(clave, tipo), metadata: this.datos.get(clave)?.metadata ?? null };
  }

  async put(clave: string, valor: string | ArrayBuffer | Uint8Array, opciones?: { metadata?: unknown }) {
    this.escrituras++;
    const guardado = valor instanceof Uint8Array ? valor.slice().buffer : valor;
    this.datos.set(clave, { valor: guardado, metadata: opciones?.metadata ?? null });
  }
}

export const CLAVE_PRUEBA = "clave-de-prueba";

export function crearEntorno(extra: Partial<Entorno> = {}) {
  const cache = new KVSimulado();
  const imagenes = new KVSimulado();
  const entorno: Entorno = {
    CACHE: cache as unknown as KVNamespace,
    IMAGENES: imagenes as unknown as KVNamespace,
    CLAVE_APP: CLAVE_PRUEBA,
    GEMINI_API_KEY: "clave-gemini-falsa",
    ...extra,
  };
  return { entorno, cache, imagenes };
}

/** IA falsa: devuelve siempre la misma respuesta y apunta cuántas veces la han llamado. */
export class IASimulada implements ProveedorIA {
  llamadas = 0;
  ultimaPeticion: PeticionJSON<unknown> | null = null;

  constructor(private readonly respuesta: Partial<FichaIA> = {}) {}

  async generarJSON<T>(peticion: PeticionJSON<T>): Promise<T> {
    this.llamadas++;
    this.ultimaPeticion = peticion as PeticionJSON<unknown>;
    return peticion.esquema.parse({ ...fichaIAEjemplo(), ...this.respuesta });
  }

  /** Vectores fijos: la misma imagen da siempre el mismo vector. */
  async embeberImagenes(imagenes: { base64: string }[]): Promise<number[][]> {
    return imagenes.map((imagen) => [imagen.base64.length % 7, 1, 2]);
  }
}

export function fichaIAEjemplo(): FichaIA {
  return {
    prenda_detectada: true,
    publico_detectado: "hombre",
    categoria: "Sudadera",
    subcategoria: "oversize con capucha",
    color_principal: { nombre: "Gris marengo", hex: "4a4a4a" },
    colores_secundarios: [],
    estampado: "liso",
    material: "algodón 100%",
    composicion: [{ fibra: "Algodón", porcentaje: 100 }],
    gramaje_gsm: 380,
    gramaje_estimado: "medio",
    fit: "oversize",
    largo: "regular",
    cuello: "capucha",
    mangas: "largas",
    cierres: null,
    detalles: ["hombros caídos", "bolsillo canguro", "Hombros caídos"],
    acabado: "cepillado",
    palabras_clave_busqueda: ["sudadera oversize gris pesada hombre", "heavyweight hoodie grey"],
    campos_estimados: [],
  };
}

/** Lee el cuerpo de error estándar: { error: { codigo, mensaje, detalle? } }. */
export async function leerError(respuesta: Response) {
  const cuerpo = (await respuesta.json()) as { error: { codigo: string; mensaje: string; detalle?: string } };
  return cuerpo.error;
}

/** Cabecera de un JPEG real (lo justo para que se reconozca el formato). */
export const JPEG_MINIMO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

export function formularioConFoto(bytes: Uint8Array = JPEG_MINIMO) {
  const formulario = new FormData();
  formulario.append("imagen", new File([bytes], "foto.jpg", { type: "image/jpeg" }));
  return formulario;
}
