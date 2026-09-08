"use client";

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  secondary: "bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:text-slate-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
  ghost: "bg-transparent text-red-700 underline underline-offset-4",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    variant === "ghost"
      ? "min-h-[40px] px-2 text-sm font-medium transition disabled:opacity-50"
      : "min-h-[44px] rounded-xl px-4 text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100";
  return (
    <button className={`${base} ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: readonly (readonly [T, string])[];
  valor: T;
  onChange: (valor: T) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid auto-cols-[minmax(9rem,1fr)] grid-flow-col gap-2 rounded-2xl bg-slate-200 p-1">
        {opciones.map(([opcion, etiqueta]) => (
          <button
            key={opcion}
            type="button"
            onClick={() => onChange(opcion)}
            className={`min-h-[44px] whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-all active:scale-95 ${
              valor === opcion ? "bg-red-600 text-white shadow-sm" : "text-slate-600"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100";

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "exito"; children: ReactNode }) {
  const tones = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-slate-200 bg-slate-50 text-slate-700",
    exito: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-red-600" />
      {label}
    </p>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    sky: "bg-sky-100 text-sky-800",
    emerald: "bg-emerald-100 text-emerald-800",
    rose: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  titulo,
  detalle,
}: {
  icon: LucideIcon;
  titulo: string;
  detalle?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={28} />
      </span>
      <p className="text-sm font-semibold text-slate-700">{titulo}</p>
      {detalle && <p className="max-w-sm text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}
