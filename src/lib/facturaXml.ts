import { XMLParser } from "fast-xml-parser";

import type { FacturaExtraidaCliente as FacturaExtraida } from "@/lib/tipos";

export type { FacturaExtraidaCliente as FacturaExtraida } from "@/lib/tipos";

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

function raizDocumento(parseado: Record<string, unknown>): Record<string, unknown> | null {
  for (const [clave, valor] of Object.entries(parseado)) {
    if (clave.startsWith("?")) continue;
    if (valor && typeof valor === "object") return valor as Record<string, unknown>;
  }
  return null;
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return String(valor).trim() || null;
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Lee el XML de una factura electrónica de Hacienda CR y saca lo que ocupa el pago. */
export function parsearFacturaXml(xmlTexto: string): FacturaExtraida {
  let parseado: Record<string, unknown>;
  try {
    parseado = parser.parse(xmlTexto) as Record<string, unknown>;
  } catch {
    throw new Error("El archivo no es un XML válido.");
  }

  const raiz = raizDocumento(parseado);
  if (!raiz) {
    throw new Error("El XML no tiene el formato de factura electrónica de Costa Rica.");
  }

  const emisor = (raiz.Emisor as Record<string, unknown> | undefined) ?? {};
  const identificacion = (emisor.Identificacion as Record<string, unknown> | undefined) ?? {};
  const resumen = (raiz.ResumenFactura as Record<string, unknown> | undefined) ?? {};
  const codigoMoneda = resumen.CodigoTipoMoneda as Record<string, unknown> | undefined;

  const fechaEmision = texto(raiz.FechaEmision);
  const total = numero(resumen.TotalComprobante);
  if (total === null) {
    throw new Error("El XML no trae ResumenFactura > TotalComprobante.");
  }

  return {
    numeroFactura: texto(raiz.NumeroConsecutivo),
    cedulaProveedor: texto(identificacion.Numero),
    nombreProveedor: texto(emisor.Nombre),
    fechaEmision: fechaEmision ? fechaEmision.slice(0, 10) : null,
    total,
    moneda: texto(codigoMoneda?.CodigoMoneda) ?? "CRC",
  };
}
