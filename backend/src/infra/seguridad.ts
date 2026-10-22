import type { MiddlewareHandler } from "hono";
import type { ContextoApp } from "../entorno";
import { Errores } from "./errores";

/**
 * Exige la cabecera X-Clave-App. Como el repositorio es público, evita que otras personas
 * usen este backend y agoten las cuotas gratuitas.
 */
export const exigirClaveApp: MiddlewareHandler<ContextoApp> = async (c, next) => {
  const esperada = c.env.CLAVE_APP;
  if (!esperada) throw Errores.servidorNoConfigurado("CLAVE_APP");
  const recibida = c.req.header("X-Clave-App") ?? "";
  if (!igualesEnTiempoConstante(recibida, esperada)) throw Errores.claveNoValida();
  await next();
};

/** Compara sin cortar en la primera diferencia, para no dar pistas por el tiempo de respuesta. */
function igualesEnTiempoConstante(a: string, b: string) {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  let diferencia = bytesA.length ^ bytesB.length;
  for (let i = 0; i < Math.max(bytesA.length, bytesB.length); i++) {
    diferencia |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diferencia === 0;
}

const LIMITE_POR_MINUTO = 20;
const contadores = new Map<string, { inicio: number; usadas: number }>();

/** Límite sencillo en memoria, por si el binding de límites de Cloudflare no está disponible. */
function permitidoEnMemoria(clave: string, ahora = Date.now()) {
  if (contadores.size > 5000) contadores.clear();
  const actual = contadores.get(clave);
  if (!actual || ahora - actual.inicio > 60_000) {
    contadores.set(clave, { inicio: ahora, usadas: 1 });
    return true;
  }
  actual.usadas += 1;
  return actual.usadas <= LIMITE_POR_MINUTO;
}

/** Limita las peticiones por instalación de la app (o por IP si no llega el identificador). */
export const limitarPeticiones: MiddlewareHandler<ContextoApp> = async (c, next) => {
  const instalacion = c.req.header("X-Instalacion-Id")?.trim().slice(0, 64);
  const clave = instalacion ? `inst:${instalacion}` : `ip:${c.req.header("CF-Connecting-IP") ?? "desconocida"}`;

  let permitido: boolean;
  try {
    permitido = c.env.LIMITADOR ? (await c.env.LIMITADOR.limit({ key: clave })).success : permitidoEnMemoria(clave);
  } catch {
    permitido = permitidoEnMemoria(clave);
  }

  if (!permitido) throw Errores.demasiadasPeticiones();
  await next();
};
