import { NextResponse } from "next/server";

import { fallo, tipoBeneficiarioValido } from "@/lib/api";
import { crearBeneficiario, listarBeneficiarios, valoresDesdeCuerpo } from "@/lib/beneficiarios";

export const runtime = "nodejs";

interface Contexto {
  params: Promise<{ tipo: string }>;
}

export async function GET(request: Request, { params }: Contexto) {
  try {
    const tipo = tipoBeneficiarioValido((await params).tipo);
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    return NextResponse.json({ beneficiarios: await listarBeneficiarios(tipo, q) });
  } catch (error) {
    return fallo(error);
  }
}

export async function POST(request: Request, { params }: Contexto) {
  try {
    const tipo = tipoBeneficiarioValido((await params).tipo);
    const beneficiario = await crearBeneficiario(tipo, valoresDesdeCuerpo(await request.json()));
    return NextResponse.json({ beneficiario }, { status: 201 });
  } catch (error) {
    return fallo(error);
  }
}
