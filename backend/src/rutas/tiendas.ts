import { Hono } from "hono";
import { tiendasActivas } from "../busqueda/listaBlanca";
import type { ContextoApp } from "../entorno";
import { exigirClaveApp, limitarPeticiones } from "../infra/seguridad";

/** GET /v1/tiendas — tiendas de la lista blanca que se usan ahora mismo. */
export const rutaTiendas = new Hono<ContextoApp>().use(exigirClaveApp, limitarPeticiones).get("/", (c) =>
  c.json({
    tiendas: tiendasActivas().map(({ id, nombre, grupo, multimarca }) => ({
      id,
      nombre,
      grupo,
      multimarca: multimarca ?? false,
    })),
  }),
);
