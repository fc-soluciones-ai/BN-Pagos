"use client";

import { Pencil, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { HistorialBeneficiario } from "@/components/HistorialBeneficiario";
import { Alert, Button, Card, EmptyState, Field, Spinner, inputClass } from "@/components/ui";
import { esCuentaClienteValida, normalizarCuentaCliente } from "@/lib/bncr/formato";
import { mensajeError } from "@/lib/errores";
import type { Beneficiario, TipoBeneficiario } from "@/lib/tipos";

interface Formulario {
  cedula: string;
  nombre: string;
  cuenta_cliente: string;
  extra: string;
}

const VACIO: Formulario = { cedula: "", nombre: "", cuenta_cliente: "", extra: "" };

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

  const cuentaNormalizada = normalizarCuentaCliente(form.cuenta_cliente);
  const cuentaOk = esCuentaClienteValida(cuentaNormalizada);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const ruta = editandoId ? `/api/beneficiarios/${tipo}/${editandoId}` : `/api/beneficiarios/${tipo}`;
      const res = await fetch(ruta, {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cuenta_cliente: cuentaNormalizada, activo: true }),
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
          <Field label="Cuenta cliente (17 dígitos) o IBAN">
            <input
              className={inputClass}
              value={form.cuenta_cliente}
              onChange={(e) => setForm({ ...form, cuenta_cliente: e.target.value })}
              placeholder="15100010012345678"
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

        {form.cuenta_cliente && !cuentaOk && (
          <Alert>
            El BNCR exige la cuenta cliente de 17 dígitos. Pegando el IBAN de 22 (CR…) se convierte
            automáticamente.
          </Alert>
        )}
        {form.cuenta_cliente && cuentaOk && cuentaNormalizada !== form.cuenta_cliente.trim() && (
          <Alert tone="info">Se guardará como cuenta cliente: {cuentaNormalizada}</Alert>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => void guardar()}
            disabled={guardando || !form.nombre.trim() || !form.cedula.trim() || !cuentaOk}
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
            detalle="Agrega el primer beneficiario con su cuenta cliente de 17 dígitos."
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
                      {beneficiario.cedula} · {beneficiario.cuenta_cliente}
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
                          cuenta_cliente: beneficiario.cuenta_cliente,
                          extra: (beneficiario.puesto ?? beneficiario.correo ?? "") || "",
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
