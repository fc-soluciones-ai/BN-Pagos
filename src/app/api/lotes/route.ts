import { NextResponse } from "next/server";

import { fallo } from "@/lib/api";
import { crearLote, listarLotes, type EntradaLote } from "@/lib/lotes";
import type { TipoLote } from "@/lib/tipos";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const tipo = new URL(request.url).searchParams.get("tipo");
    const filtro = tipo === "planilla" || tipo === "proveedores" ? (tipo as TipoLote) : undefined;
    return NextResponse.json({ lotes: await listarLotes(filtro) });
  } catch (error) {
    return fallo(error);
  }
}

export async function POST(request: Request) {
  try {
    const entrada = (await request.json()) as EntradaLote;
    const { lote, contenido } = await crearLote(entrada);
    return NextResponse.json({ lote, contenido }, { status: 201 });
  } catch (error) {
    return fallo(error);
  }
}
