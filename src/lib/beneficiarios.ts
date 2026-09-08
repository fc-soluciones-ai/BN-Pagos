import "server-only";

import { esCuentaClienteValida, normalizarCuentaCliente, soloDigitos } from "@/lib/bncr/formato";
import { getSupabaseAdminClient, manejarErrorSupabase } from "@/lib/supabase/admin";
import type { Beneficiario, TipoBeneficiario } from "@/lib/tipos";

const TABLA: Record<TipoBeneficiario, string> = {
  empleado: "bncr_empleados",
  proveedor: "bncr_proveedores",
};

/** Campo propio de cada catálogo, además de los comunes. */
const CAMPO_EXTRA: Record<TipoBeneficiario, "puesto" | "correo"> = {
  empleado: "puesto",
  proveedor: "correo",
};

export function esTipoBeneficiario(valor: string): valor is TipoBeneficiario {
  return valor === "empleado" || valor === "proveedor";
}

export interface ValoresBeneficiario {
  cedula: string;
  nombre: string;
  cuenta_cliente: string;
  activo: boolean;
  /** `puesto` para empleados, `correo` para proveedores. */
  extra: string | null;
}

interface CuerpoBeneficiario {
  cedula?: string;
  nombre?: string;
  cuenta_cliente?: string;
  activo?: boolean;
  extra?: string | null;
}

export function valoresDesdeCuerpo(cuerpo: unknown): ValoresBeneficiario {
  const datos = (cuerpo ?? {}) as CuerpoBeneficiario;
  return {
    cedula: datos.cedula ?? "",
    nombre: datos.nombre ?? "",
    cuenta_cliente: datos.cuenta_cliente ?? "",
    activo: datos.activo ?? true,
    extra: datos.extra ?? null,
  };
}

function normalizar(tipo: TipoBeneficiario, valores: ValoresBeneficiario) {
  const cedula = soloDigitos(valores.cedula);
  const nombre = valores.nombre.trim();
  const cuenta = normalizarCuentaCliente(valores.cuenta_cliente);

  if (!cedula) throw new Error("La cédula del beneficiario es obligatoria.");
  if (!nombre) throw new Error("El nombre del beneficiario es obligatorio.");
  if (!esCuentaClienteValida(cuenta)) {
    throw new Error(
      "La cuenta debe ser la cuenta cliente de 17 dígitos del BNCR (si tienes el IBAN de 22, pégalo y se convierte solo).",
    );
  }

  return {
    cedula,
    nombre,
    cuenta_cliente: cuenta,
    activo: valores.activo,
    [CAMPO_EXTRA[tipo]]: valores.extra?.trim() || null,
  };
}

export async function listarBeneficiarios(
  tipo: TipoBeneficiario,
  busqueda = "",
): Promise<Beneficiario[]> {
  const supabase = getSupabaseAdminClient();
  let consulta = supabase.from(TABLA[tipo]).select("*").order("nombre");
  if (busqueda) consulta = consulta.or(`nombre.ilike.%${busqueda}%,cedula.ilike.%${busqueda}%`);

  const { data, error } = await consulta;
  if (error) manejarErrorSupabase(error);
  return (data ?? []) as Beneficiario[];
}

export async function crearBeneficiario(
  tipo: TipoBeneficiario,
  valores: ValoresBeneficiario,
): Promise<Beneficiario> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TABLA[tipo])
    .insert(normalizar(tipo, valores))
    .select("*")
    .single();

  if (error) manejarErrorSupabase(error);
  return data as Beneficiario;
}

export async function actualizarBeneficiario(
  tipo: TipoBeneficiario,
  id: string,
  valores: ValoresBeneficiario,
): Promise<Beneficiario> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TABLA[tipo])
    .update(normalizar(tipo, valores))
    .eq("id", id)
    .select("*")
    .single();

  if (error) manejarErrorSupabase(error);
  return data as Beneficiario;
}

/**
 * Se desactiva en vez de borrar: los lotes ya exportados conservan la
 * referencia al beneficiario para el historial de pagos.
 */
export async function desactivarBeneficiario(tipo: TipoBeneficiario, id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from(TABLA[tipo]).update({ activo: false }).eq("id", id);
  if (error) manejarErrorSupabase(error);
}
