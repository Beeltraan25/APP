import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type CodigoError =
  | "PETICION_NO_VALIDA"
  | "IMAGEN_NO_VALIDA"
  | "IMAGEN_DEMASIADO_GRANDE"
  | "CLAVE_NO_VALIDA"
  | "DEMASIADAS_PETICIONES"
  | "PRENDA_NO_DETECTADA"
  | "SOLO_HOMBRE"
  | "PAGINA_SIN_DATOS"
  | "CUOTA_AGOTADA"
  | "IA_NO_DISPONIBLE"
  | "CUOTA_BUSQUEDAS"
  | "BUSQUEDA_NO_DISPONIBLE"
  | "SIN_PIEZAS"
  | "NO_ENCONTRADO"
  | "SERVIDOR_NO_CONFIGURADO"
  | "ERROR_INTERNO";

/** Error con un código estable (para la app) y un mensaje amable en español (para el usuario). */
export class ErrorApp extends Error {
  constructor(
    readonly codigo: CodigoError,
    readonly estado: ContentfulStatusCode,
    mensaje: string,
    /** Información técnica. Solo se envía a la app en errores de petición, para depurar. */
    readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = "ErrorApp";
  }
}

export const Errores = {
  peticionNoValida: (detalle?: string) =>
    new ErrorApp("PETICION_NO_VALIDA", 400, "La petición no tiene el formato esperado.", detalle),
  imagenNoValida: () =>
    new ErrorApp("IMAGEN_NO_VALIDA", 415, "No podemos leer esa imagen. Prueba con una foto en JPG, PNG, WEBP o HEIC."),
  imagenDemasiadoGrande: () =>
    new ErrorApp("IMAGEN_DEMASIADO_GRANDE", 413, "La foto es demasiado grande. Prueba con otra de menos de 4 MB."),
  claveNoValida: () =>
    new ErrorApp("CLAVE_NO_VALIDA", 401, "Esta app no está autorizada para usar el servidor."),
  demasiadasPeticiones: () =>
    new ErrorApp("DEMASIADAS_PETICIONES", 429, "Vas muy rápido. Espera un minuto y vuelve a intentarlo."),
  prendaNoDetectada: () =>
    new ErrorApp(
      "PRENDA_NO_DETECTADA",
      422,
      "No hemos encontrado ninguna prenda en la foto. Prueba con una en la que se vea entera y con buena luz.",
    ),
  soloHombre: () => new ErrorApp("SOLO_HOMBRE", 422, "Por ahora Dupe Finder solo busca ropa de hombre."),
  paginaSinDatos: () =>
    new ErrorApp(
      "PAGINA_SIN_DATOS",
      422,
      "No hemos podido leer la prenda de este enlace. Haz una captura de pantalla y busca con la foto.",
    ),
  cuotaAgotada: () =>
    new ErrorApp(
      "CUOTA_AGOTADA",
      503,
      "Hemos llegado al límite gratuito de análisis por hoy. Vuelve a intentarlo mañana.",
    ),
  iaNoDisponible: (detalle?: unknown) =>
    new ErrorApp(
      "IA_NO_DISPONIBLE",
      502,
      "No hemos podido analizar la prenda ahora mismo. Inténtalo de nuevo en unos segundos.",
      detalle,
    ),
  cuotaBusquedas: () =>
    new ErrorApp(
      "CUOTA_BUSQUEDAS",
      503,
      "Hemos llegado al límite gratuito de búsquedas en tiendas. Vuelve a intentarlo más adelante.",
    ),
  busquedaNoDisponible: (detalle?: unknown) =>
    new ErrorApp(
      "BUSQUEDA_NO_DISPONIBLE",
      502,
      "No hemos podido buscar en las tiendas ahora mismo. Inténtalo de nuevo en unos segundos.",
      detalle,
    ),
  sinPiezas: () =>
    new ErrorApp(
      "SIN_PIEZAS",
      422,
      "No hemos encontrado piezas para este estilo dentro del presupuesto. Prueba con otro presupuesto o estilo.",
    ),
  noEncontrado: () => new ErrorApp("NO_ENCONTRADO", 404, "No hemos encontrado lo que buscabas."),
  servidorNoConfigurado: (falta: string) =>
    new ErrorApp("SERVIDOR_NO_CONFIGURADO", 500, "El servidor no está bien configurado.", `Falta ${falta}`),
  interno: () => new ErrorApp("ERROR_INTERNO", 500, "Algo ha fallado en el servidor. Inténtalo de nuevo."),
};

/** Formato único de error: { "error": { "codigo", "mensaje", "detalle"? } } */
export function respuestaError(c: Context, error: ErrorApp) {
  const detalle = error.codigo === "PETICION_NO_VALIDA" && typeof error.detalle === "string" ? error.detalle : undefined;
  return c.json({ error: { codigo: error.codigo, mensaje: error.message, ...(detalle ? { detalle } : {}) } }, error.estado);
}
