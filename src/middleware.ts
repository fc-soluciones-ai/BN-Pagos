import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPortalUrl } from "@/lib/portal-url";

/**
 * Refresca la sesión de Supabase en cada request y, si no hay, manda al login
 * del Portal Madre con `redirectTo` para que al volver nos entregue la sesión
 * en /auth/callback. Sin esto las sesiones vencen en silencio: los Server
 * Components no pueden escribir cookies.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY (ver .env.example).",
    );
  }

  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          respuesta.cookies.set(name, value, options),
        );
      },
    },
  });

  // No quitar: getUser() revalida el token contra Supabase Auth y es lo que
  // efectivamente refresca la sesión antes de que llegue a la página.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", getPortalUrl());
    login.searchParams.set("redirectTo", request.url);
    return NextResponse.redirect(login);
  }

  return respuesta;
}

export const config = {
  matcher: [
    // Todo salvo los assets de Next, la API (que autentica por request) y
    // /auth, que debe quedar pública para poder completar el login.
    "/((?!_next/static|_next/image|favicon\\.ico|api/|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
