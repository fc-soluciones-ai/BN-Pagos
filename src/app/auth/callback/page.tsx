"use client";

import { useEffect, useState } from "react";

import { cambiarInquilinoActivo } from "@/app/auth/acciones";
import { getPortalUrl } from "@/lib/portal-url";
import { createClient } from "@/lib/supabase/client";

/**
 * El Portal Madre redirige acá después del login con la sesión
 * (access_token/refresh_token) en el FRAGMENTO (#) de la URL — nunca en el
 * query string, porque el fragmento no viaja al servidor (ni logs, ni
 * Referer). Por eso es una página cliente y no un Route Handler: solo el
 * navegador puede leer `window.location.hash`.
 */
export default function CallbackAuth() {
  const [error, setError] = useState(false);

  useEffect(() => {
    async function iniciarSesion() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const destino = hash.get("next") || "/";

      if (!accessToken || !refreshToken) {
        setError(true);
        return;
      }

      const supabase = createClient();
      const { error: errorSesion } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (errorSesion) {
        setError(true);
        return;
      }

      const query = new URL(window.location.href).searchParams;
      await cambiarInquilinoActivo(
        hash.get("tenant_id") ??
          hash.get("inquilino_id") ??
          query.get("tenant_id") ??
          query.get("inquilino_id"),
      );

      // Navegación completa (no router.push): el middleware corre en el
      // servidor y tiene que leer las cookies recién escritas.
      window.location.replace(destino);
    }

    void iniciarSesion();
  }, []);

  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      {error ? (
        <p className="text-sm text-slate-600">
          No se pudo iniciar sesión.{" "}
          <a href={`${getPortalUrl()}/login`} className="font-medium text-blue-600 underline">
            Volver al Portal
          </a>
        </p>
      ) : (
        <p className="text-sm text-slate-500">Iniciando sesión…</p>
      )}
    </main>
  );
}
