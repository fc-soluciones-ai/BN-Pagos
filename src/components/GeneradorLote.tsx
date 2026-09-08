"use client";

import { Download, FileUp, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, Button, Card, EmptyState, Field, Spinner, inputClass } from "@/components/ui";
import {
  aCentimos,
  construirArchivoBncr,
  ErrorFormatoBncr,
  formatearMonto,
  normalizarTexto,
  type ExtensionArchivo,
  type MonedaBncr,
} from "@/lib/bncr/formato";
import { descargarTexto } from "@/lib/descargar";
import { mensajeError } from "@/lib/errores";
import type { Beneficiario, FacturaExtraidaCliente, TipoLote } from "@/lib/tipos";

interface Rubro {
  descripcion: string;
  numero_factura: string;
  monto: string;
}

interface SeleccionadoUI {
  beneficiario: Beneficiario;
  rubros: Rubro[];
  concepto: string;
}

interface DatosLote {
  descripcion: string;
  cuenta_debito: string;
  cedula_empresa: string;
  nombre_empresa: string;
  moneda: MonedaBncr;
  fecha_aplicacion: string;
  extension: ExtensionArchivo;
}

const TIPO_BENEFICIARIO = { planilla: "empleado", proveedores: "proveedor" } as const;

function rubroVacio(tipo: TipoLote): Rubro {
  return { descripcion: tipo === "planilla" ? "Salario base" : "", numero_factura: "", monto: "" };
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function montoDeRubros(rubros: Rubro[]): number {
  return rubros.reduce((total, rubro) => total + aCentimos(Number(rubro.monto) || 0), 0);
}

function conceptoAutomatico(tipo: TipoLote, rubros: Rubro[]): string {
  if (tipo === "proveedores") {
    const facturas = rubros.map((rubro) => rubro.numero_factura).filter(Boolean);
    if (facturas.length > 0) return `FACT ${facturas.join(" ")}`;
  }
  return rubros
    .map((rubro) => rubro.descripcion)
    .filter(Boolean)
    .join(" + ");
}

/**
 * Arma un lote de pagos: se eligen beneficiarios del catálogo y a cada uno se
 * le agregan N rubros (planilla) o N facturas (proveedores); la app suma los
 * rubros de cada persona y exporta un único depósito acumulado por beneficiario.
 */
export function GeneradorLote({ tipo }: { tipo: TipoLote }) {
  const tipoBeneficiario = TIPO_BENEFICIARIO[tipo];
  const [catalogo, setCatalogo] = useState<Beneficiario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<SeleccionadoUI[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [datos, setDatos] = useState<DatosLote>({
    descripcion: tipo === "planilla" ? "PLANILLA QUINCENAL" : "PAGO PROVEEDORES",
    cuenta_debito: process.env.NEXT_PUBLIC_CUENTA_DEBITO ?? "",
    cedula_empresa: process.env.NEXT_PUBLIC_EMPRESA_CEDULA ?? "",
    nombre_empresa: process.env.NEXT_PUBLIC_EMPRESA_NOMBRE ?? "",
    moneda: "CRC",
    fecha_aplicacion: hoy(),
    extension: "txt",
  });

  useEffect(() => {
    let activo = true;
    fetch(`/api/beneficiarios/${tipoBeneficiario}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el catálogo.");
        if (activo) {
          setCatalogo(((json.beneficiarios ?? []) as Beneficiario[]).filter((b) => b.activo));
        }
      })
      .catch((err) => activo && setError(mensajeError(err, "No se pudo cargar el catálogo.")))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [tipoBeneficiario]);

  const disponibles = catalogo.filter(
    (beneficiario) => !seleccion.some((fila) => fila.beneficiario.id === beneficiario.id),
  );

  function agregar(id: string) {
    const beneficiario = catalogo.find((fila) => fila.id === id);
    if (!beneficiario) return;
    setSeleccion((actual) => [
      ...actual,
      { beneficiario, rubros: [rubroVacio(tipo)], concepto: "" },
    ]);
  }

  function actualizarRubro(indice: number, posicion: number, cambios: Partial<Rubro>) {
    setSeleccion((actual) =>
      actual.map((fila, i) =>
        i === indice
          ? {
              ...fila,
              rubros: fila.rubros.map((rubro, j) =>
                j === posicion ? { ...rubro, ...cambios } : rubro,
              ),
            }
          : fila,
      ),
    );
  }

  const totalCentimos = seleccion.reduce((total, fila) => total + montoDeRubros(fila.rubros), 0);

  /** Vista previa local: el consecutivo real lo asigna la base al generar. */
  const previa = useMemo(() => {
    const detalles = seleccion
      .map((fila) => ({
        cuentaCliente: fila.beneficiario.cuenta_cliente,
        cedula: fila.beneficiario.cedula,
        nombre: fila.beneficiario.nombre,
        concepto: fila.concepto.trim() || conceptoAutomatico(tipo, fila.rubros),
        montoCentimos: montoDeRubros(fila.rubros),
      }))
      .filter((detalle) => detalle.montoCentimos > 0);

    if (detalles.length === 0) return null;
    try {
      return construirArchivoBncr({
        cedulaEmpresa: datos.cedula_empresa,
        nombreEmpresa: datos.nombre_empresa,
        cuentaDebito: datos.cuenta_debito,
        moneda: datos.moneda,
        fechaAplicacion: datos.fecha_aplicacion,
        consecutivo: 0,
        descripcion: datos.descripcion,
        detalles,
      });
    } catch (err) {
      return err instanceof ErrorFormatoBncr ? err.message : null;
    }
  }, [seleccion, datos, tipo]);

  async function generar() {
    setGenerando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/lotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          ...datos,
          detalles: seleccion.map((fila) => ({
            beneficiario_id: fila.beneficiario.id,
            concepto: fila.concepto,
            rubros: fila.rubros
              .filter((rubro) => Number(rubro.monto) > 0)
              .map((rubro) => ({
                descripcion: rubro.descripcion || (rubro.numero_factura ? "FACTURA" : "PAGO"),
                numero_factura: rubro.numero_factura || null,
                monto: Number(rubro.monto),
              })),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar el archivo.");

      descargarTexto(json.lote.nombre_archivo, json.contenido);
      setAviso(
        `Lote #${json.lote.consecutivo} generado y guardado en el historial: ${json.lote.nombre_archivo}`,
      );
      setSeleccion([]);
    } catch (err) {
      setError(mensajeError(err, "No se pudo generar el archivo."));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Datos del lote (encabezado tipo 1 y 2)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cédula jurídica de la empresa">
            <input
              className={inputClass}
              value={datos.cedula_empresa}
              onChange={(e) => setDatos({ ...datos, cedula_empresa: e.target.value })}
            />
          </Field>
          <Field label="Nombre de la empresa">
            <input
              className={inputClass}
              value={datos.nombre_empresa}
              onChange={(e) => setDatos({ ...datos, nombre_empresa: e.target.value })}
            />
          </Field>
          <Field label="Cuenta débito origen (17 dígitos)">
            <input
              className={inputClass}
              value={datos.cuenta_debito}
              onChange={(e) => setDatos({ ...datos, cuenta_debito: e.target.value })}
            />
          </Field>
          <Field label="Descripción del lote (30 caracteres)">
            <input
              className={inputClass}
              maxLength={30}
              value={datos.descripcion}
              onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
            />
          </Field>
          <Field label="Fecha de aplicación">
            <input
              type="date"
              className={inputClass}
              value={datos.fecha_aplicacion}
              onChange={(e) => setDatos({ ...datos, fecha_aplicacion: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda">
              <select
                className={inputClass}
                value={datos.moneda}
                onChange={(e) => setDatos({ ...datos, moneda: e.target.value as MonedaBncr })}
              >
                <option value="CRC">Colones</option>
                <option value="USD">Dólares</option>
              </select>
            </Field>
            <Field label="Extensión">
              <select
                className={inputClass}
                value={datos.extension}
                onChange={(e) =>
                  setDatos({ ...datos, extension: e.target.value as ExtensionArchivo })
                }
              >
                <option value="txt">.txt</option>
                <option value="env">.env</option>
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            {tipo === "planilla" ? "Empleados a pagar" : "Proveedores a pagar"}
          </h2>
          {cargando ? (
            <Spinner label="Cargando catálogo…" />
          ) : (
            <select
              className={`${inputClass} max-w-xs`}
              value=""
              onChange={(e) => e.target.value && agregar(e.target.value)}
            >
              <option value="">Agregar del catálogo…</option>
              {disponibles.map((beneficiario) => (
                <option key={beneficiario.id} value={beneficiario.id}>
                  {beneficiario.nombre} — {beneficiario.cedula}
                </option>
              ))}
            </select>
          )}
        </div>

        {seleccion.length === 0 ? (
          <EmptyState
            icon={Users}
            titulo="Sin beneficiarios en el lote"
            detalle={
              tipo === "planilla"
                ? "Agrega empleados y desglosa sus rubros: la app suma todo en un solo depósito por persona."
                : "Agrega proveedores y sus facturas (manuales o desde XML/PDF): se depositan acumuladas."
            }
          />
        ) : (
          <ul className="space-y-3">
            {seleccion.map((fila, indice) => (
              <li key={fila.beneficiario.id} className="rounded-2xl border border-slate-200 p-3">
                <FilaBeneficiario
                  tipo={tipo}
                  fila={fila}
                  moneda={datos.moneda}
                  onQuitar={() =>
                    setSeleccion((actual) => actual.filter((_, i) => i !== indice))
                  }
                  onCambiarConcepto={(concepto) =>
                    setSeleccion((actual) =>
                      actual.map((item, i) => (i === indice ? { ...item, concepto } : item)),
                    )
                  }
                  onAgregarRubro={(rubro) =>
                    setSeleccion((actual) =>
                      actual.map((item, i) =>
                        i === indice ? { ...item, rubros: [...item.rubros, rubro] } : item,
                      ),
                    )
                  }
                  onQuitarRubro={(posicion) =>
                    setSeleccion((actual) =>
                      actual.map((item, i) =>
                        i === indice
                          ? { ...item, rubros: item.rubros.filter((_, j) => j !== posicion) }
                          : item,
                      ),
                    )
                  }
                  onCambiarRubro={(posicion, cambios) => actualizarRubro(indice, posicion, cambios)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-sm font-semibold text-slate-700">
            Total del lote: {formatearMonto(totalCentimos, datos.moneda)} · {seleccion.length}{" "}
            {seleccion.length === 1 ? "beneficiario" : "beneficiarios"}
          </p>
          <Button
            className="flex items-center gap-2"
            disabled={generando || seleccion.length === 0 || typeof previa === "string" || !previa}
            onClick={() => void generar()}
          >
            <Download size={16} />
            {generando ? "Generando…" : "Generar archivo BNCR"}
          </Button>
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      {aviso && <Alert tone="exito">{aviso}</Alert>}
      {typeof previa === "string" && <Alert>{previa}</Alert>}

      {previa && typeof previa !== "string" && (
        <Card className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">Vista previa del archivo</h2>
          <p className="text-xs text-slate-500">
            El consecutivo del encabezado se asigna al generar; cada línea va en ancho fijo.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs leading-5 text-slate-100">
            {previa.lineas.join("\n")}
          </pre>
        </Card>
      )}
    </div>
  );
}

function FilaBeneficiario({
  tipo,
  fila,
  moneda,
  onQuitar,
  onCambiarConcepto,
  onAgregarRubro,
  onQuitarRubro,
  onCambiarRubro,
}: {
  tipo: TipoLote;
  fila: SeleccionadoUI;
  moneda: MonedaBncr;
  onQuitar: () => void;
  onCambiarConcepto: (concepto: string) => void;
  onAgregarRubro: (rubro: Rubro) => void;
  onQuitarRubro: (posicion: number) => void;
  onCambiarRubro: (posicion: number, cambios: Partial<Rubro>) => void;
}) {
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorFactura, setErrorFactura] = useState<string | null>(null);

  const total = montoDeRubros(fila.rubros);
  const concepto = normalizarTexto(fila.concepto.trim() || conceptoAutomatico(tipo, fila.rubros));

  async function importarFactura(archivo: File) {
    setLeyendo(true);
    setErrorFactura(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append("archivo", archivo);
      const res = await fetch("/api/facturas/extraer", { method: "POST", body: cuerpo });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo leer la factura.");

      const factura = json.factura as FacturaExtraidaCliente;
      onAgregarRubro({
        descripcion: factura.nombreProveedor ?? "FACTURA",
        numero_factura: factura.numeroFactura ?? "",
        monto: factura.total ? String(factura.total) : "",
      });
    } catch (err) {
      setErrorFactura(mensajeError(err, "No se pudo leer la factura."));
    } finally {
      setLeyendo(false);
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{fila.beneficiario.nombre}</p>
          <p className="font-mono text-xs text-slate-500">
            {fila.beneficiario.cedula} · {fila.beneficiario.cuenta_cliente}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-900">{formatearMonto(total, moneda)}</span>
          <Button variant="ghost" onClick={onQuitar} aria-label="Quitar del lote">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {fila.rubros.map((rubro, posicion) => (
          <li key={posicion} className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
            <input
              className={inputClass}
              placeholder={tipo === "planilla" ? "Rubro (ej. Lavado de carro)" : "Detalle de la factura"}
              value={rubro.descripcion}
              onChange={(e) => onCambiarRubro(posicion, { descripcion: e.target.value })}
            />
            {tipo === "proveedores" ? (
              <input
                className={inputClass}
                placeholder="N° factura"
                value={rubro.numero_factura}
                onChange={(e) => onCambiarRubro(posicion, { numero_factura: e.target.value })}
              />
            ) : (
              <span className="hidden sm:block" />
            )}
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="Monto"
              value={rubro.monto}
              onChange={(e) => onCambiarRubro(posicion, { monto: e.target.value })}
            />
            <Button
              variant="ghost"
              onClick={() => onQuitarRubro(posicion)}
              aria-label="Quitar rubro"
              disabled={fila.rubros.length === 1}
            >
              <Trash2 size={14} />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="flex items-center gap-1"
          onClick={() => onAgregarRubro(rubroVacio(tipo))}
        >
          <Plus size={14} />
          {tipo === "planilla" ? "Agregar rubro" : "Agregar factura"}
        </Button>
        {tipo === "proveedores" && (
          <>
            <input
              ref={inputArchivo}
              type="file"
              accept=".xml,.pdf,application/pdf,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void importarFactura(archivo);
              }}
            />
            <Button
              variant="secondary"
              className="flex items-center gap-1"
              disabled={leyendo}
              onClick={() => inputArchivo.current?.click()}
            >
              <FileUp size={14} />
              {leyendo ? "Leyendo…" : "Cargar XML / PDF"}
            </Button>
          </>
        )}
      </div>

      {errorFactura && <Alert>{errorFactura}</Alert>}

      <Field label="Concepto que viaja en el archivo (30 caracteres, MAYÚSCULAS sin tildes)">
        <input
          className={inputClass}
          maxLength={30}
          placeholder={concepto}
          value={fila.concepto}
          onChange={(e) => onCambiarConcepto(e.target.value)}
        />
      </Field>
      <p className="font-mono text-xs text-slate-500">Se exportará como: {concepto.slice(0, 30)}</p>
    </div>
  );
}
