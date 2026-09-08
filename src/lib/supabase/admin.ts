import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.",
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Código de PostgreSQL para "tabla inexistente" (falta correr la migración). */
export const TABLA_INEXISTENTE = "42P01";

export const ERROR_MIGRACION =
  "Falta correr supabase/migrations/0001_bncr_pagos_masivos.sql en el SQL Editor de Supabase.";

export function manejarErrorSupabase(error: { code?: string; message: string }): never {
  if (error.code === TABLA_INEXISTENTE) throw new Error(ERROR_MIGRACION);
  if (error.code === "23505") throw new Error("Ya existe un registro con esa cédula.");
  throw new Error(error.message);
}
