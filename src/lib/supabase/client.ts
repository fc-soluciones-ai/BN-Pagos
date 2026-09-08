import { createBrowserClient } from "@supabase/ssr";

/** Cliente de Supabase para componentes `'use client'` (solo lo usa /auth/callback). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY (ver .env.example).",
    );
  }

  return createBrowserClient(url, anonKey);
}
