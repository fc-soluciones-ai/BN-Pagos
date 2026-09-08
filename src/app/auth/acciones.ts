"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Fija la empresa con la que se entró desde el Portal. Solo aplica a un
 * superadmin (que puede administrar más de un inquilino); para cualquier otro
 * usuario es un no-op, porque su empresa sale de `profiles.inquilino_id`.
 *
 * Se llama en cada login, incluso con `null`, para que la sesión quede en un
 * estado determinístico y no arrastre la empresa de una sesión anterior.
 */
export async function cambiarInquilinoActivo(inquilinoId: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "superadmin") return;

  await supabase.from("profiles").update({ active_inquilino_id: inquilinoId }).eq("id", user.id);
  revalidatePath("/", "layout");
}
