import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function credenciales() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY (ver .env.example).",
    );
  }

  return { url, anonKey };
}

/**
 * Cliente de Supabase con la sesión del usuario, para Server Components y
 * Route Handlers. Va con la llave anónima a propósito: así toda consulta pasa
 * por las políticas RLS del portal (`current_inquilino_id()`) y el aislamiento
 * entre inquilinos se sostiene aunque la capa de app tenga un bug.
 */
export async function createClient() {
  const { url, anonKey } = credenciales();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component: no puede escribir cookies. El middleware es el
          // que refresca la sesión, así que se ignora.
        }
      },
    },
  });
}

/** Código de PostgreSQL para "tabla inexistente" (falta correr la migración). */
export const TABLA_INEXISTENTE = "42P01";

export const ERROR_MIGRACION =
  "Falta correr supabase/migrations/0001_bncr_pagos_masivos.sql en el SQL Editor de Supabase.";

export function manejarErrorSupabase(error: { code?: string; message: string }): never {
  if (error.code === TABLA_INEXISTENTE) throw new Error(ERROR_MIGRACION);
  if (error.code === "23505") throw new Error("Ya existe un registro con esa cédula.");
  if (error.code === "42501") {
    throw new Error("Tu usuario no tiene acceso a los pagos de esta empresa.");
  }
  throw new Error(error.message);
}
