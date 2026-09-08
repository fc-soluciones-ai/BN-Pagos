"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components/ui";
import { formatearMonto } from "@/lib/bncr/formato";
import { mensajeError } from "@/lib/errores";
import type { MovimientoHistorial, TipoBeneficiario } from "@/lib/tipos";

/** Pagos históricos de un empleado o proveedor, con el desglose de cada lote. */
export function HistorialBeneficiario({
  tipo,
  beneficiarioId,
}: {
  tipo: TipoBeneficiario;
  beneficiarioId: string;
}) {
  const [movimientos, setMovimientos] = useState<MovimientoHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    fetch(`/api/beneficiarios/${tipo}/${beneficiarioId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el historial.");
        if (activo) setMovimientos((json.movimientos ?? []) as MovimientoHistorial[]);
      })
      .catch((err) => activo && setError(mensajeError(err, "No se pudo cargar el historial.")))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [tipo, beneficiarioId]);

  if (cargando) return <Spinner label="Cargando historial…" />;
  if (error) return <Alert>{error}</Alert>;
  if (movimientos.length === 0) {
    return <p className="text-xs text-slate-500">Todavía no aparece en ningún lote exportado.</p>;
  }

  return (
    <ul className="space-y-2 rounded-xl bg-slate-50 p-3">
      {movimientos.map((movimiento) => (
        <li key={movimiento.id} className="text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            {movimiento.bncr_lotes?.fecha_aplicacion} · Lote #{movimiento.bncr_lotes?.consecutivo} ·{" "}
            {formatearMonto(
              Math.round(movimiento.monto_pagar * 100),
              movimiento.bncr_lotes?.moneda ?? "CRC",
            )}
          </p>
          <p className="font-mono">{movimiento.concepto}</p>
          {(movimiento.bncr_rubros_pago ?? []).map((rubro) => (
            <p key={rubro.id} className="pl-3">
              · {rubro.numero_factura ? `${rubro.numero_factura} — ` : ""}
              {rubro.descripcion}: {formatearMonto(rubro.monto_centimos, movimiento.bncr_lotes?.moneda ?? "CRC")}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}
