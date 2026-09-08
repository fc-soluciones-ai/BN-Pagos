"use client";

import { Download, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert, Badge, Button, Card, EmptyState, Spinner, inputClass } from "@/components/ui";
import { formatearMonto } from "@/lib/bncr/formato";
import { mensajeError } from "@/lib/errores";
import type { Lote, LoteConDetalles, TipoLote } from "@/lib/tipos";

const FILTROS = [
  ["", "Todos"],
  ["planilla", "Planilla"],
  ["proveedores", "Proveedores"],
] as const;

export function HistorialLotes() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [filtro, setFiltro] = useState<TipoLote | "">("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<LoteConDetalles | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/lotes${filtro ? `?tipo=${filtro}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el historial.");
      setLotes((json.lotes ?? []) as Lote[]);
    } catch (err) {
      setError(mensajeError(err, "No se pudo cargar el historial."));
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function abrir(id: string) {
    if (detalle?.id === id) {
      setDetalle(null);
      return;
    }
    try {
      const res = await fetch(`/api/lotes/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo abrir el lote.");
      setDetalle(json.lote as LoteConDetalles);
    } catch (err) {
      setError(mensajeError(err, "No se pudo abrir el lote."));
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Lotes exportados</h2>
        <select
          className={`${inputClass} max-w-[12rem]`}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as TipoLote | "")}
        >
          {FILTROS.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}

      {cargando ? (
        <Spinner label="Cargando historial…" />
      ) : lotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          titulo="Todavía no hay lotes"
          detalle="Cada archivo que generes queda guardado aquí para volver a descargarlo."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {lotes.map((lote) => (
            <li key={lote.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    #{lote.consecutivo} · {lote.descripcion}{" "}
                    <Badge tone={lote.tipo === "planilla" ? "sky" : "amber"}>{lote.tipo}</Badge>
                  </p>
                  <p className="text-xs text-slate-500">
                    {lote.fecha_aplicacion} · {lote.cantidad_detalles} pagos ·{" "}
                    {formatearMonto(lote.total_centimos, lote.moneda)} ·{" "}
                    <span className="font-mono">{lote.nombre_archivo}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => void abrir(lote.id)}>
                    {detalle?.id === lote.id ? "Cerrar" : "Ver detalle"}
                  </Button>
                  <a href={`/api/lotes/${lote.id}/archivo`} download={lote.nombre_archivo}>
                    <Button variant="secondary" className="flex items-center gap-1">
                      <Download size={14} />
                      Descargar
                    </Button>
                  </a>
                </div>
              </div>

              {detalle?.id === lote.id && (
                <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                  <ul className="space-y-2 text-xs text-slate-600">
                    {detalle.bncr_detalles_pago
                      .slice()
                      .sort((a, b) => a.linea - b.linea)
                      .map((fila) => (
                        <li key={fila.id}>
                          <p className="font-semibold text-slate-800">
                            {fila.linea}. {fila.nombre_beneficiario} —{" "}
                            {formatearMonto(fila.monto_centimos, lote.moneda)}
                          </p>
                          <p className="font-mono">
                            {fila.cuenta_cliente} · {fila.concepto}
                          </p>
                          {(fila.bncr_rubros_pago ?? []).map((rubro) => (
                            <p key={rubro.id} className="pl-3">
                              · {rubro.numero_factura ? `${rubro.numero_factura} — ` : ""}
                              {rubro.descripcion}:{" "}
                              {formatearMonto(rubro.monto_centimos, lote.moneda)}
                            </p>
                          ))}
                        </li>
                      ))}
                  </ul>
                  <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                    {detalle.contenido.replace(/\r\n/g, "\n").trimEnd()}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
