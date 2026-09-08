import { NextResponse } from "next/server";

import { fallo, tipoBeneficiarioValido } from "@/lib/api";
import {
  actualizarBeneficiario,
  desactivarBeneficiario,
  valoresDesdeCuerpo,
} from "@/lib/beneficiarios";
import { historialBeneficiario } from "@/lib/lotes";

export const runtime = "nodejs";

interface Contexto {
  params: Promise<{ tipo: string; id: string }>;
}

/** Historial de pagos del beneficiario (todos los lotes en los que aparece). */
export async function GET(_request: Request, { params }: Contexto) {
  try {
    const { tipo, id } = await params;
    return NextResponse.json({
      movimientos: await historialBeneficiario(tipoBeneficiarioValido(tipo), id),
    });
  } catch (error) {
    return fallo(error);
  }
}

export async function PATCH(request: Request, { params }: Contexto) {
  try {
    const { tipo, id } = await params;
    const beneficiario = await actualizarBeneficiario(
      tipoBeneficiarioValido(tipo),
      id,
      valoresDesdeCuerpo(await request.json()),
    );
    return NextResponse.json({ beneficiario });
  } catch (error) {
    return fallo(error);
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const { tipo, id } = await params;
    await desactivarBeneficiario(tipoBeneficiarioValido(tipo), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fallo(error);
  }
}
