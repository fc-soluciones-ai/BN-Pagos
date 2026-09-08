import "server-only";

import type { FacturaExtraida } from "@/lib/facturaXml";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const PROMPT =
  "Eres un asistente contable de Costa Rica. Lee la factura adjunta y devuelve " +
  "únicamente un JSON con las claves numeroFactura (consecutivo o número de factura), " +
  "cedulaProveedor (solo dígitos), nombreProveedor, fechaEmision (yyyy-mm-dd) y " +
  "total (número con decimales, el total a pagar del comprobante, sin símbolos ni " +
  "separadores de miles). Usa null cuando un dato no aparezca en el documento.";

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Falta GEMINI_API_KEY: los PDF se leen con Gemini. Sube el XML de la factura o digita el monto a mano.",
    );
  }
  return key;
}

function limpiarJson(texto: string): string {
  return texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

/** Extrae número, proveedor y total de una factura en PDF usando Gemini. */
export async function extraerFacturaPdf(base64: string, mimeType: string): Promise<FacturaExtraida> {
  const res = await fetch(`${API_BASE}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as GenerateContentResponse;
  const texto = json.candidates?.[0]?.content?.parts?.map((parte) => parte.text ?? "").join("").trim();
  if (!texto) throw new Error("Gemini no devolvió datos para la factura.");

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(limpiarJson(texto)) as Record<string, unknown>;
  } catch {
    throw new Error("No se pudo interpretar la respuesta de Gemini para la factura.");
  }

  const total = Number(datos.total);
  return {
    numeroFactura: datos.numeroFactura ? String(datos.numeroFactura) : null,
    cedulaProveedor: datos.cedulaProveedor ? String(datos.cedulaProveedor).replace(/\D/g, "") : null,
    nombreProveedor: datos.nombreProveedor ? String(datos.nombreProveedor) : null,
    fechaEmision: datos.fechaEmision ? String(datos.fechaEmision).slice(0, 10) : null,
    total: Number.isFinite(total) && total > 0 ? total : null,
    moneda: datos.moneda ? String(datos.moneda) : "CRC",
  };
}
