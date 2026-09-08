import { NextResponse } from "next/server";

import { fallo } from "@/lib/api";
import { parsearFacturaXml } from "@/lib/facturaXml";
import { extraerFacturaPdf } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMITE_BYTES = 10 * 1024 * 1024;

/** Lee una factura de proveedor: los XML se parsean aquí mismo y los PDF pasan por Gemini. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      throw new Error("Adjunta el XML o el PDF de la factura.");
    }
    if (archivo.size > LIMITE_BYTES) {
      throw new Error("El archivo supera los 10 MB.");
    }

    const nombre = archivo.name.toLowerCase();
    if (nombre.endsWith(".xml") || archivo.type.includes("xml")) {
      return NextResponse.json({ factura: parsearFacturaXml(await archivo.text()) });
    }

    if (nombre.endsWith(".pdf") || archivo.type === "application/pdf") {
      const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
      return NextResponse.json({ factura: await extraerFacturaPdf(base64, "application/pdf") });
    }

    throw new Error("Formato no soportado: sube el XML o el PDF de la factura.");
  } catch (error) {
    return fallo(error);
  }
}
