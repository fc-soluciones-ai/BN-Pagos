import "server-only";

/**
 * Contexto multi-tenant del portal. Todas las tablas `bncr_` viven en la base
 * centralizada junto al resto de los módulos, así que cada consulta se filtra
 * por `inquilino_id` y cada inserción lo graba junto con `empresa_id`.
 *
 * Las escrituras usan el service role (que se salta RLS), por eso el filtro se
 * aplica también aquí y no solo en la política de la base.
 */
export interface ContextoTenant {
  inquilino_id: string;
  empresa_id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerUuid(nombre: string): string {
  const valor = (process.env[nombre] ?? "").trim();
  if (!valor) {
    throw new Error(
      `Falta la variable ${nombre}: el módulo de pagos necesita saber a qué inquilino y empresa pertenecen los datos.`,
    );
  }
  if (!UUID.test(valor)) {
    throw new Error(`La variable ${nombre} debe ser un UUID válido (recibido: "${valor}").`);
  }
  return valor.toLowerCase();
}

export function contextoTenant(): ContextoTenant {
  return {
    inquilino_id: leerUuid("INQUILINO_ID"),
    empresa_id: leerUuid("EMPRESA_ID"),
  };
}
