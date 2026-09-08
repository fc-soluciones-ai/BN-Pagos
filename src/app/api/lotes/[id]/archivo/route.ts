import { NextResponse } from "next/server";

import { fallo } from "@/lib/api";
import { obtenerLote } from "@/lib/lotes";

export const runtime = "nodejs";

interface Contexto {
  params: Promise<{ id: string }>;
}

/** Vuelve a descargar el archivo tal cual se generó, desde el historial. */
export async function GET(_request: Request, { params }: Contexto) {
  try {
    const lote = await obtenerLote((await params).id);
    return new NextResponse(lote.contenido, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${lote.nombre_archivo}"`,
      },
    });
  } catch (error) {
    return fallo(error);
  }
}
