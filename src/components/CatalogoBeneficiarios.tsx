"use client";

import { Pencil, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { HistorialBeneficiario } from "@/components/HistorialBeneficiario";
import { Alert, Button, Card, EmptyState, Field, Spinner, inputClass } from "@/components/ui";
import { BANCOS_SOPORTADOS, esIbanCostaRicaValido, normalizarIban } from "@/lib/bncr/formato";
import { mensajeError } from "@/lib/errores";
import type { Beneficiario, TipoBeneficiario } from "@/lib/tipos";

/** Colaborador de la app de Planillas, para enlazar el empleado con su ficha de RRHH. */
interface ColaboradorPlanilla {
  id: string;
  cedula: string;
  nombre_completo: string;
  puesto: string | null;
  iban: string | null;
}

interface Formulario {
  cedula: string;
  nombre: string;
  banco: string;
  cuenta_iban: string;
  extra: string;
  planilla_empleado_id: string;
}

const VACIO: Formulario = {
  cedula: "",
  nombre: "",
  banco: BANCOS_SOPORTADOS[0],
  cuenta_iban: "",
  extra: "",
  planilla_empleado_id: "",
};

const ETIQUETA_EXTRA: Record<TipoBeneficiario, string> = {
  empleado: "Puesto",
  proveedor: "Correo",
};

const TITULO: Record<TipoBeneficiario, string> = {
  empleado: "Empleados",
  proveedor: "Proveedores",
};

export function CatalogoBeneficiarios({ tipo }: { tipo: TipoBeneficiario }) {
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [historialId, setHistorialId] = useState<string | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorPlanilla[]>([]);

  useEffect(() => {
    if (tipo !== "empleado") return;
    // Sin colaboradores el catálogo sigue sirviendo (el enlace es opcional),
    // así que un fallo acá no se muestra como error de la pantalla.
    void fetch("/api/planilla/colaboradores")
      .then((res) => (res.ok ? res.json() : { colaboradores: [] }))
      .then((json) => setColaboradores((json.colaboradores ?? []) as ColaboradorPlanilla[]))
      .catch(() => setColaboradores([]));
  }, [tipo]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/beneficiarios/${tipo}?q=${encodeURIComponent(busqueda)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el catálogo.");
      setBeneficiarios((json.beneficiarios ?? []) as Beneficiario[]);
    } catch (err) {
      setError(mensajeError(err, "No se pudo cargar el catálogo."));
    } finally {
      setCargando(false);
    }
  }, [tipo, busqueda]);

  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(), busqueda ? 300 : 0);
    return () => clearTimeout(temporizador);
  }, [cargar, busqueda]);

  const ibanNormalizado = normalizarIban(form.cuenta_iban);
  const ibanOk = !ibanNormalizado || esIbanCostaRicaValido(ibanNormalizado);

  /** Al elegir un colaborador de Planillas se copian sus datos como punto de partida. */
  function tomarDeColaborador(id: string) {
    const colaborador = colaboradores.find((fila) => fila.id === id);
    if (!colaborador) {
      setForm({ ...form, planilla_empleado_id: "" });
      return;
    }
    setForm({
      ...form,
      planilla_empleado_id: id,
      cedula: colaborador.cedula,
      nombre: colaborador.nombre_completo,
      cuenta_iban: colaborador.iban ?? form.cuenta_iban,
      extra: colaborador.puesto ?? form.extra,
    });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const ruta = editandoId ? `/api/beneficiarios/${tipo}/${editandoId}` : `/api/beneficiarios/${tipo}`;
      const res = await fetch(ruta, {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cuenta_iban: ibanNormalizado,
          planilla_empleado_id: form.planilla_empleado_id || null,
          activo: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar.");
      setForm(VACIO);
      setEditandoId(null);
      await cargar();
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  }

  async function desactivar(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/beneficiarios/${tipo}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "No se pudo desactivar.");
      await cargar();
    } catch (err) {
      setError(mensajeError(err, "No se pudo desactivar."));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">
          {editandoId ? `Editar ${tipo}` : `Nuevo ${tipo}`}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {tipo === "empleado" && colaboradores.length > 0 && (
            <Field label="Colaborador de Planillas (opcional)">
              <select
                className={inputClass}
                value={form.planilla_empleado_id}
                onChange={(e) => tomarDeColaborador(e.target.value)}
              >
                <option value="">Sin enlazar</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nombre_completo} · {colaborador.cedula}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Cédula">
            <input
              className={inputClass}
              value={form.cedula}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            />
          </Field>
          <Field label="Nombre o razón social">
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </Field>
          <Field label="Banco destino">
            <select
              className={inputClass}
              value={form.banco}
              onChange={(e) => setForm({ ...form, banco: e.target.value })}
            >
              {BANCOS_SOPORTADOS.map((banco) => (
                <option key={banco} value={banco}>
                  {banco}
                </option>
              ))}
            </select>
          </Field>
          <Field label="IBAN (opcional, solo de referencia)">
            <input
              className={inputClass}
              value={form.cuenta_iban}
              onChange={(e) => setForm({ ...form, cuenta_iban: e.target.value })}
              placeholder="CR21015100010012345678"
            />
          </Field>
          <Field label={ETIQUETA_EXTRA[tipo]}>
            <input
              className={inputClass}
              value={form.extra}
              onChange={(e) => setForm({ ...form, extra: e.target.value })}
            />
          </Field>
        </div>

        {!ibanOk && <Alert>El IBAN debe ser CR seguido de 20 dígitos (22 en total).</Alert>}
        <Alert tone="info">
          El archivo del BNCR identifica al beneficiario con el código de su banco y la cédula: el
          IBAN queda como referencia para que puedas verificar la cuenta.
        </Alert>

        <div className="flex gap-2">
          <Button
            onClick={() => void guardar()}
            disabled={guardando || !form.nombre.trim() || !form.cedula.trim() || !ibanOk}
            className="flex items-center gap-2"
          >
            <UserPlus size={16} />
            {editandoId ? "Guardar cambios" : "Agregar"}
          </Button>
          {editandoId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditandoId(null);
                setForm(VACIO);
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">{TITULO[tipo]}</h2>
          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Buscar por nombre o cédula"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {cargando ? (
          <Spinner label="Cargando catálogo…" />
        ) : beneficiarios.length === 0 ? (
          <EmptyState
            icon={Users}
            titulo="Sin registros"
            detalle="Agrega el primer beneficiario con su cédula y su banco destino."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {beneficiarios.map((beneficiario) => (
              <li key={beneficiario.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {beneficiario.nombre}
                      {!beneficiario.activo && " (inactivo)"}
                    </p>
                    <p className="font-mono text-xs text-slate-500">
                      {beneficiario.cedula} · {beneficiario.banco}
                      {beneficiario.cuenta_iban ? ` · ${beneficiario.cuenta_iban}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setHistorialId(historialId === beneficiario.id ? null : beneficiario.id)
                      }
                    >
                      Historial
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex items-center gap-1"
                      onClick={() => {
                        setEditandoId(beneficiario.id);
                        setForm({
                          cedula: beneficiario.cedula,
                          nombre: beneficiario.nombre,
                          banco: beneficiario.banco,
                          cuenta_iban: beneficiario.cuenta_iban ?? "",
                          extra: (beneficiario.puesto ?? beneficiario.correo ?? "") || "",
                          planilla_empleado_id: beneficiario.planilla_empleado_id ?? "",
                        });
                      }}
                    >
                      <Pencil size={14} />
                      Editar
                    </Button>
                    {beneficiario.activo && (
                      <Button
                        variant="danger"
                        className="flex items-center gap-1"
                        onClick={() => void desactivar(beneficiario.id)}
                      >
                        <Trash2 size={14} />
                        Desactivar
                      </Button>
                    )}
                  </div>
                </div>
                {historialId === beneficiario.id && (
                  <HistorialBeneficiario tipo={tipo} beneficiarioId={beneficiario.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
