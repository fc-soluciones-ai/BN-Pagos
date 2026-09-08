import { NextResponse } from "next/server";

import { fallo } from "@/lib/api";
import { listarColaboradoresPlanilla } from "@/lib/beneficiarios";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ colaboradores: await listarColaboradoresPlanilla() });
  } catch (error) {
    return fallo(error);
  }
}
