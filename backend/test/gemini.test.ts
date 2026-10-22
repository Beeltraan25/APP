import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FichaIA } from "../src/esquemas/ficha";
import { esquemaParaGemini, ProveedorGemini } from "../src/ia/gemini";
import { ErrorApp } from "../src/infra/errores";

const Esquema = z.object({ color: z.string() });

function respuestaInteraccion(texto: string) {
  return Response.json({
    id: "int_1",
    status: "completed",
    steps: [
      { type: "user_input", content: [{ type: "text", text: "pregunta" }] },
      { type: "model_output", content: [{ type: "text", text: texto }] },
    ],
  });
}

function crearGemini(fetchFalso: typeof fetch, modelos = ["modelo-a", "modelo-b"]) {
  return new ProveedorGemini({ apiKey: "clave", modelos, fetch: fetchFalso });
}

const peticion = {
  instrucciones: "Eres un experto.",
  partes: [
    { tipo: "texto" as const, texto: "¿De qué color es?" },
    { tipo: "imagen" as const, base64: "AAAA", mime: "image/jpeg" },
  ],
  esquema: Esquema,
};

describe("ProveedorGemini", () => {
  it("envía la petición en el formato de la API Interactions y lee la respuesta", async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () => respuestaInteraccion('{"color":"gris"}'));
    const resultado = await crearGemini(fetchFalso).generarJSON(peticion);

    expect(resultado).toEqual({ color: "gris" });
    const [url, opciones] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect((opciones?.headers as Record<string, string>)["x-goog-api-key"]).toBe("clave");

    const cuerpo = JSON.parse(opciones?.body as string);
    expect(cuerpo.model).toBe("modelo-a");
    expect(cuerpo.store).toBe(false);
    expect(cuerpo.system_instruction).toBe("Eres un experto.");
    expect(cuerpo.input).toEqual([
      { type: "text", text: "¿De qué color es?" },
      { type: "image", data: "AAAA", mime_type: "image/jpeg" },
    ]);
    expect(cuerpo.response_format.mime_type).toBe("application/json");
    expect(cuerpo.response_format.schema.properties.color.type).toBe("string");
  });

  it("si el primer modelo agota la cuota, usa el de respaldo", async () => {
    const fetchFalso = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("cuota agotada", { status: 429 }))
      .mockResolvedValueOnce(respuestaInteraccion('{"color":"azul"}'));

    expect(await crearGemini(fetchFalso).generarJSON(peticion)).toEqual({ color: "azul" });
    expect(JSON.parse(fetchFalso.mock.calls[1]![1]?.body as string).model).toBe("modelo-b");
  });

  it("si todos los modelos agotan la cuota, devuelve CUOTA_AGOTADA", async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () => new Response("cuota agotada", { status: 429 }));
    await expect(crearGemini(fetchFalso).generarJSON(peticion)).rejects.toMatchObject({ codigo: "CUOTA_AGOTADA" });
  });

  it("si la respuesta no cumple el esquema, prueba el siguiente modelo y acaba en IA_NO_DISPONIBLE", async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () => respuestaInteraccion('{"otro":1}'));
    const error = await crearGemini(fetchFalso).generarJSON(peticion).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApp);
    expect((error as ErrorApp).codigo).toBe("IA_NO_DISPONIBLE");
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("acepta JSON envuelto en un bloque de código", async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () => respuestaInteraccion('```json\n{"color":"negro"}\n```'));
    expect(await crearGemini(fetchFalso).generarJSON(peticion)).toEqual({ color: "negro" });
  });
});

describe("esquemaParaGemini", () => {
  const esquema = esquemaParaGemini(FichaIA);
  const texto = JSON.stringify(esquema);

  it("no incluye $schema", () => {
    expect(esquema.$schema).toBeUndefined();
  });

  it("solo usa palabras clave que Gemini entiende", () => {
    // Gemini no documenta "pattern", "format: uri" ni "$ref" a definiciones externas.
    expect(texto).not.toContain('"pattern"');
    expect(texto).not.toContain('"$defs"');
  });

  it("marca como obligatorios todos los campos (los opcionales admiten null)", () => {
    expect(esquema.required).toEqual(Object.keys(FichaIA.shape));
  });
});
