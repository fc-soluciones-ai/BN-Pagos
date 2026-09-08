import { NextResponse } from "next/server";

import { esTipoBeneficiario } from "@/lib/beneficiarios";
import type { TipoBeneficiario } from "@/lib/tipos";

/** Respuesta de error uniforme para las rutas de la API. */
export function fallo(error: unknown, status = 400): NextResponse {
  const mensaje = error instanceof Error ? error.message : "Error desconocido";
  return NextResponse.json({ error: mensaje }, { status });
}

export function tipoBeneficiarioValido(tipo: string): TipoBeneficiario {
  if (!esTipoBeneficiario(tipo)) {
    throw new Error('El catálogo debe ser "empleado" o "proveedor".');
  }
  return tipo;
}
