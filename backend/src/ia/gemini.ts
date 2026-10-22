import { z } from "zod";
import type { Entorno } from "../entorno";
import { Errores } from "../infra/errores";
import type { ImagenEntrada, ParteEntrada, PeticionJSON, ProveedorIA } from "./proveedor";

const URL_INTERACCIONES = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODELOS_POR_DEFECTO = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const MODELO_EMBEDDINGS = "gemini-embedding-2";
/** 256 dimensiones bastan para comparar prendas y la respuesta pesa 12 veces menos que con 3072. */
const DIMENSIONES_EMBEDDINGS = 256;

export interface OpcionesGemini {
  apiKey: string;
  modeloEmbeddings?: string;
  /** En orden de preferencia: si uno agota la cuota o falla, se prueba el siguiente. */
  modelos: string[];
  /** Para los tests. */
  fetch?: typeof fetch;
  tiempoMaximoMs?: number;
}

/** Forma (parcial) de la respuesta de la API Interactions de Gemini. */
interface RespuestaInteraccion {
  status?: string;
  output_text?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  errors?: { code?: string; message?: string }[];
}

/** Gemini mediante su API REST "Interactions" (sin SDK: menos dependencias dentro del Worker). */
export class ProveedorGemini implements ProveedorIA {
  constructor(private readonly opciones: OpcionesGemini) {}

  /** Vectores de imagen con gemini-embedding-2 (gratis). Todas las imágenes van en una sola petición. */
  async embeberImagenes(imagenes: ImagenEntrada[]): Promise<number[][]> {
    if (!imagenes.length) return [];
    const peticionFetch = this.opciones.fetch ?? fetch;
    const modelo = this.opciones.modeloEmbeddings ?? MODELO_EMBEDDINGS;
    const respuesta = await peticionFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.opciones.apiKey },
        body: JSON.stringify({
          requests: imagenes.map((imagen) => ({
            model: `models/${modelo}`,
            content: { parts: [{ inline_data: { mime_type: imagen.mime, data: imagen.base64 } }] },
            output_dimensionality: DIMENSIONES_EMBEDDINGS,
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (respuesta.status === 429) throw Errores.cuotaAgotada();
    if (!respuesta.ok) throw Errores.iaNoDisponible(`embeddings: HTTP ${respuesta.status} ${(await respuesta.text()).slice(0, 300)}`);
    const datos = (await respuesta.json()) as { embeddings?: { values?: number[] }[] };
    const vectores = (datos.embeddings ?? []).map((e) => e.values ?? []);
    if (vectores.length !== imagenes.length || vectores.some((v) => !v.length)) {
      throw Errores.iaNoDisponible("embeddings: respuesta incompleta");
    }
    return vectores;
  }

  async generarJSON<T>({ instrucciones, partes, esquema }: PeticionJSON<T>): Promise<T> {
    const peticionFetch = this.opciones.fetch ?? fetch;
    const cuerpoBase = {
      input: partes.map(aContenidoGemini),
      system_instruction: instrucciones,
      response_format: { type: "text", mime_type: "application/json", schema: esquemaParaGemini(esquema) },
      generation_config: { thinking_level: "low", max_output_tokens: 4096 },
      // No guardar las peticiones en los servidores de Google.
      store: false,
    };

    let cuotaAgotada = false;
    let ultimoFallo: unknown;

    for (const modelo of this.opciones.modelos) {
      try {
        const respuesta = await peticionFetch(URL_INTERACCIONES, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.opciones.apiKey },
          body: JSON.stringify({ model: modelo, ...cuerpoBase }),
          signal: AbortSignal.timeout(this.opciones.tiempoMaximoMs ?? 45_000),
        });

        if (!respuesta.ok) {
          if (respuesta.status === 429) cuotaAgotada = true;
          ultimoFallo = `${modelo}: HTTP ${respuesta.status} ${(await respuesta.text()).slice(0, 500)}`;
          continue;
        }

        const datos = (await respuesta.json()) as RespuestaInteraccion;
        if (datos.status && datos.status !== "completed") {
          ultimoFallo = `${modelo}: estado ${datos.status} ${JSON.stringify(datos.errors ?? [])}`;
          continue;
        }

        const texto = extraerTexto(datos);
        if (!texto) {
          ultimoFallo = `${modelo}: respuesta sin texto`;
          continue;
        }

        const validado = esquema.safeParse(JSON.parse(quitarBloqueDeCodigo(texto)));
        if (!validado.success) {
          ultimoFallo = `${modelo}: JSON fuera de esquema ${z.prettifyError(validado.error)}`;
          continue;
        }
        return validado.data;
      } catch (error) {
        ultimoFallo = `${modelo}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    console.error("Gemini no ha podido responder con ningún modelo", ultimoFallo);
    throw cuotaAgotada ? Errores.cuotaAgotada() : Errores.iaNoDisponible(ultimoFallo);
  }
}

export function crearProveedorGemini(entorno: Entorno): ProveedorIA {
  if (!entorno.GEMINI_API_KEY) throw Errores.servidorNoConfigurado("GEMINI_API_KEY");
  const modelos = entorno.GEMINI_MODELOS?.split(",").map((m) => m.trim()).filter(Boolean);
  return new ProveedorGemini({
    apiKey: entorno.GEMINI_API_KEY,
    modelos: modelos?.length ? modelos : MODELOS_POR_DEFECTO,
  });
}

/** Esquema Zod → JSON Schema en el formato que acepta Gemini. */
export function esquemaParaGemini(esquema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(esquema, { target: "draft-2020-12", io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function aContenidoGemini(parte: ParteEntrada) {
  return parte.tipo === "texto"
    ? { type: "text", text: parte.texto }
    : { type: "image", data: parte.base64, mime_type: parte.mime };
}

/** El texto generado está en el último paso "model_output". */
function extraerTexto(datos: RespuestaInteraccion): string | null {
  if (typeof datos.output_text === "string" && datos.output_text) return datos.output_text;
  const pasos = datos.steps ?? [];
  for (let i = pasos.length - 1; i >= 0; i--) {
    const paso = pasos[i];
    if (paso?.type !== "model_output") continue;
    const texto = (paso.content ?? [])
      .filter((bloque) => bloque.type === "text" && typeof bloque.text === "string")
      .map((bloque) => bloque.text)
      .join("");
    if (texto) return texto;
  }
  return null;
}

/** Por si el modelo envuelve el JSON en ```json … ```. */
function quitarBloqueDeCodigo(texto: string) {
  return texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
