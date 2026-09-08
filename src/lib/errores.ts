/** Traduce al español los mensajes técnicos que devuelven Supabase o el navegador. */
const TRADUCCIONES: [RegExp, string][] = [
  [/failed to fetch|networkerror|network request failed/i, "Sin conexión con el servidor. Revisa la red e inténtalo de nuevo."],
  [/jwt expired|invalid compact jws|invalid api key/i, "Las credenciales de Supabase no son válidas o vencieron."],
  [/row-level security|permission denied/i, "La base de datos rechazó la operación por permisos."],
  [/duplicate key value/i, "Ya existe un registro con esos datos."],
  [/timeout|timed out/i, "La operación tardó demasiado. Inténtalo de nuevo."],
];

export function mensajeError(error: unknown, respaldo: string): string {
  const original = error instanceof Error ? error.message.trim() : "";
  if (!original) return respaldo;

  for (const [patron, traduccion] of TRADUCCIONES) {
    if (patron.test(original)) return traduccion;
  }
  return original;
}
