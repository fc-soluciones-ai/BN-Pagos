import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Contexto de sesión y de inquilino, resuelto igual que en el resto del
 * portal: la empresa NO viene de una variable de entorno sino de la fila del
 * usuario en `public.profiles`, y un superadmin puede estar viendo otra
 * empresa vía `active_inquilino_id`.
 *
 * Es el espejo, del lado de la app, de lo que `public.current_inquilino_id()`
 * decide a nivel de RLS. Si alguna vez quedan desalineados, manda RLS: acá
 * solo se agrega un filtro extra, nunca se reemplaza la política.
 */
export interface ContextoTenant {
  userId: string;
  email: string | null;
  inquilinoId: string;
  role: string | null;
  esSuperAdmin: boolean;
}

/** Falta de sesión o de empresa asignada: la API la traduce a 401. */
export class ErrorSesion extends Error {}

export async function contextoTenant(): Promise<ContextoTenant> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new ErrorSesion("Tu sesión venció. Volvé a entrar desde el Portal.");
  }

  const { data: perfil, error } = await supabase
    .from("profiles")
    .select("inquilino_id, role, active_inquilino_id")
    .eq("id", user.id)
    .single();

  // Un error de la consulta (RLS, caché de PostgREST tras un ALTER TABLE,
  // timeout) no es lo mismo que "este usuario no tiene empresa": se distingue
  // para no mandar a revisar la asignación de empresa a alguien que la tiene.
  if (error) {
    throw new Error(`No se pudo leer tu perfil del portal: ${error.message}`);
  }

  if (!perfil?.inquilino_id) {
    throw new ErrorSesion("Tu usuario todavía no tiene una empresa asignada en el Portal.");
  }

  const esSuperAdmin = perfil.role === "superadmin";

  return {
    userId: user.id,
    email: user.email ?? null,
    inquilinoId:
      esSuperAdmin && perfil.active_inquilino_id ? perfil.active_inquilino_id : perfil.inquilino_id,
    role: perfil.role ?? null,
    esSuperAdmin,
  };
}

/** Sesión + cliente ya listo: es lo que usa toda la capa de datos. */
export async function sesion() {
  const [supabase, tenant] = await Promise.all([createClient(), contextoTenant()]);
  return { supabase, tenant };
}
