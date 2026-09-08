import "server-only";

import {
  codigoBancoDesde,
  esIbanCostaRicaValido,
  normalizarIban,
  soloDigitos,
} from "@/lib/bncr/formato";
import { manejarErrorSupabase } from "@/lib/supabase/server";
import { sesion } from "@/lib/tenant";
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
  banco: string;
  cuenta_iban: string;
  activo: boolean;
  /** `puesto` para empleados, `correo` para proveedores. */
  extra: string | null;
  /** Colaborador de `planillas_empleados` al que corresponde este empleado. */
  planilla_empleado_id?: string | null;
}

interface CuerpoBeneficiario {
  cedula?: string;
  nombre?: string;
  banco?: string;
  cuenta_iban?: string;
  activo?: boolean;
  extra?: string | null;
  planilla_empleado_id?: string | null;
}

export function valoresDesdeCuerpo(cuerpo: unknown): ValoresBeneficiario {
  const datos = (cuerpo ?? {}) as CuerpoBeneficiario;
  return {
    cedula: datos.cedula ?? "",
    nombre: datos.nombre ?? "",
    banco: datos.banco ?? "",
    cuenta_iban: datos.cuenta_iban ?? "",
    activo: datos.activo ?? true,
    extra: datos.extra ?? null,
    planilla_empleado_id: datos.planilla_empleado_id ?? null,
  };
}

function normalizar(tipo: TipoBeneficiario, valores: ValoresBeneficiario) {
  const cedula = soloDigitos(valores.cedula);
  const nombre = valores.nombre.trim();
  const banco = valores.banco.trim();
  const iban = normalizarIban(valores.cuenta_iban ?? "");

  if (!cedula) throw new Error("La cédula del beneficiario es obligatoria.");
  if (cedula.length > 9) {
    throw new Error(
      "El archivo del BNCR identifica al beneficiario con una cédula de 9 dígitos; revisá el número digitado.",
    );
  }
  if (!nombre) throw new Error("El nombre del beneficiario es obligatorio.");
  if (!codigoBancoDesde(banco)) {
    throw new Error(
      `No se reconoce el banco "${banco || "(vacío)"}". Elegí uno de la lista: sin el código de banco el archivo no se puede generar.`,
    );
  }
  // El IBAN es opcional (no viaja en el archivo), pero si se digita tiene que
  // estar bien: es lo que el cliente usa para verificar la cuenta destino.
  if (iban && !esIbanCostaRicaValido(iban)) {
    throw new Error("El IBAN de Costa Rica debe ser CR seguido de 20 dígitos (22 en total).");
  }

  return {
    cedula,
    nombre,
    banco,
    cuenta_iban: iban || null,
    activo: valores.activo,
    [CAMPO_EXTRA[tipo]]: valores.extra?.trim() || null,
    ...(tipo === "empleado" ? { planilla_empleado_id: valores.planilla_empleado_id ?? null } : {}),
  };
}

export async function listarBeneficiarios(
  tipo: TipoBeneficiario,
  busqueda = "",
): Promise<Beneficiario[]> {
  const { supabase, tenant } = await sesion();
  let consulta = supabase
    .from(TABLA[tipo])
    .select("*")
    .eq("inquilino_id", tenant.inquilinoId)
    .order("nombre");
  if (busqueda) consulta = consulta.or(`nombre.ilike.%${busqueda}%,cedula.ilike.%${busqueda}%`);

  const { data, error } = await consulta;
  if (error) manejarErrorSupabase(error);
  return (data ?? []) as Beneficiario[];
}

export async function crearBeneficiario(
  tipo: TipoBeneficiario,
  valores: ValoresBeneficiario,
): Promise<Beneficiario> {
  const { supabase, tenant } = await sesion();
  const { data, error } = await supabase
    .from(TABLA[tipo])
    .insert({ ...normalizar(tipo, valores), inquilino_id: tenant.inquilinoId })
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
  const { supabase, tenant } = await sesion();
  const { data, error } = await supabase
    .from(TABLA[tipo])
    .update(normalizar(tipo, valores))
    .eq("id", id)
    .eq("inquilino_id", tenant.inquilinoId)
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
  const { supabase, tenant } = await sesion();
  const { error } = await supabase
    .from(TABLA[tipo])
    .update({ activo: false })
    .eq("id", id)
    .eq("inquilino_id", tenant.inquilinoId);
  if (error) manejarErrorSupabase(error);
}

/** Colaborador del módulo de planilla, para enlazar el catálogo de empleados. */
export interface ColaboradorPlanilla {
  id: string;
  cedula: string;
  nombre_completo: string;
  puesto: string | null;
  iban: string | null;
}

interface FilaPlanilla {
  id: string;
  cedula: string;
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string | null;
  puesto: string | null;
  iban: string | null;
}

/**
 * Colaboradores de `planillas_empleados` (la app de Planillas del portal) para
 * poder enlazar cada empleado del catálogo con su ficha de RRHH. Si ese módulo
 * todavía no está desplegado en la base, devuelve una lista vacía en vez de
 * romper el catálogo.
 */
export async function listarColaboradoresPlanilla(): Promise<ColaboradorPlanilla[]> {
  const { supabase, tenant } = await sesion();
  const { data, error } = await supabase
    .from("planillas_empleados")
    .select("id, cedula, nombre, primer_apellido, segundo_apellido, puesto, iban")
    .eq("inquilino_id", tenant.inquilinoId)
    .eq("estado", "Activo")
    .order("primer_apellido");

  if (error) {
    if (error.code === "42P01") return [];
    manejarErrorSupabase(error);
  }

  return ((data ?? []) as FilaPlanilla[]).map((fila) => ({
    id: fila.id,
    cedula: fila.cedula,
    nombre_completo: [fila.nombre, fila.primer_apellido, fila.segundo_apellido]
      .filter(Boolean)
      .join(" "),
    puesto: fila.puesto,
    iban: fila.iban,
  }));
}
