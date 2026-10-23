import type { DatosPagina } from "../esquemas/pagina";

/** Como Safari en un iPhone: algunas tiendas responden mejor a un navegador conocido. */
const AGENTE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const TAMANO_MAXIMO_HTML = 2 * 1024 * 1024;

/** ¿La página llega sin nada que analizar? (la web solo puede enviar el enlace). */
export function paginaVacia(pagina: DatosPagina) {
  return !pagina.titulo && !pagina.descripcion && !pagina.imagen_url && pagina.json_ld == null;
}

/**
 * Descarga y lee la página desde el servidor. Lo usa la versión web, que no puede leer páginas
 * de otras webs. Muchas tiendas bloquean a los servidores: entonces devuelve la página tal cual.
 */
export async function completarPaginaDesdeServidor(pagina: DatosPagina, f: typeof fetch = fetch): Promise<DatosPagina> {
  // 1) Descarga directa.
  const directa = await descargarHtml(f, pagina.url, {
    "User-Agent": AGENTE_SAFARI,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
  }, 8000);
  const leida = directa ? { ...extraerDatosHtml(directa, pagina.url), url: pagina.url } : null;
  if (leida && !paginaVacia(leida)) return leida;

  // 2) Plan B: Jina Reader (gratis, sin clave) abre la página con un navegador de verdad.
  // Funciona con algunas tiendas que bloquean a los servidores (p. ej. Zalando); con otras, no.
  // Jina devuelve el HTML como text/plain.
  const lector = await descargarHtml(f, `${LECTOR_JINA}${pagina.url}`, { "X-Respond-With": "html" }, 20000, ["html", "text/plain"]);
  if (lector) {
    const datos = { ...extraerDatosHtml(lector, pagina.url), url: pagina.url };
    if (!paginaVacia(datos)) return datos;
  }
  return pagina;
}

const LECTOR_JINA = "https://r.jina.ai/";

async function descargarHtml(
  f: typeof fetch,
  url: string,
  cabeceras: Record<string, string>,
  espera: number,
  tipos = ["html"],
) {
  try {
    const respuesta = await f(url, { headers: cabeceras, redirect: "follow", signal: AbortSignal.timeout(espera) });
    const tipo = respuesta.headers.get("Content-Type") ?? "text/html";
    if (!respuesta.ok || !tipos.some((t) => tipo.includes(t))) return null;
    return (await respuesta.text()).slice(0, TAMANO_MAXIMO_HTML);
  } catch {
    return null;
  }
}

/** Lee título, imagen, precio, descripción y JSON-LD del HTML (lo mismo que hace la app en el iPhone). */
export function extraerDatosHtml(html: string, url: string): DatosPagina {
  const metas = new Map<string, string>();
  for (const etiqueta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const nombre = atributo(etiqueta, "property") ?? atributo(etiqueta, "name") ?? atributo(etiqueta, "itemprop");
    const contenido = atributo(etiqueta, "content");
    if (nombre && contenido && !metas.has(nombre.toLowerCase())) metas.set(nombre.toLowerCase(), decodificar(contenido));
  }

  const tituloHtml = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const titulo = metas.get("og:title") ?? (tituloHtml ? decodificar(tituloHtml).trim() : null);

  let imagen = metas.get("og:image") ?? metas.get("og:image:secure_url") ?? metas.get("twitter:image") ?? null;
  if (imagen) {
    try {
      imagen = new URL(imagen, url).toString().replace(/^http:/, "https:");
    } catch {
      imagen = null;
    }
  }

  const importe = metas.get("product:price:amount") ?? metas.get("og:price:amount");
  const moneda = metas.get("product:price:currency") ?? metas.get("og:price:currency");

  const jsonLd: unknown[] = [];
  for (const bloque of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonLd.push(JSON.parse(bloque[1]!.trim()));
    } catch {
      // JSON-LD mal formado: se ignora.
    }
  }

  return {
    url,
    titulo: titulo?.slice(0, 300) || null,
    imagen_url: imagen,
    precio_texto: importe ? `${importe} ${moneda ?? ""}`.trim() : null,
    descripcion: (metas.get("og:description") ?? metas.get("description"))?.slice(0, 4000) ?? null,
    json_ld: jsonLd.length === 0 ? undefined : jsonLd.length === 1 ? jsonLd[0] : jsonLd,
  };
}

function atributo(etiqueta: string, nombre: string) {
  const coincidencia = etiqueta.match(new RegExp(`\\b${nombre}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return coincidencia ? (coincidencia[2] ?? coincidencia[3] ?? null) : null;
}

function decodificar(texto: string) {
  return texto
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
