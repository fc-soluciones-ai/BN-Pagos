import { NextResponse } from "next/server";

import { fallo } from "@/lib/api";
import { obtenerLote } from "@/lib/lotes";

export const runtime = "nodejs";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Contexto) {
  try {
    return NextResponse.json({ lote: await obtenerLote((await params).id) });
  } catch (error) {
    return fallo(error);
  }
}
